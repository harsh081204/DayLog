import os
import sys
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Response, Cookie
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

# Add project root, ai-layer and database to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)
sys.path.append(os.path.join(project_root, "ai-layer"))
sys.path.append(os.path.join(project_root, "database"))

from journal_service import create_journal_entry
from database import connect_db, close_db, journals_col, users_col

# ── Config ───────────────────────────────────────────────────────────────────
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key-123")
JWT_ALGORITHM = "HS256"
COOKIE_NAME = "token"

# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()

app = FastAPI(title="DayLog Backend", lifespan=lifespan)

# ── Schemas ──────────────────────────────────────────────────────────────────
class JournalSubmitRequest(BaseModel):
    raw_text: str

class SignupRequest(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    password: str = Field(..., min_length=8)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

# ── Helpers ──────────────────────────────────────────────────────────────────
def create_jwt(user_id: str):
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,  # Set to True in production (HTTPS)
        samesite="strict",
        max_age=604800,  # 7 days
        path="/"
    )

# ── Auth Routes ──────────────────────────────────────────────────────────────

@app.post("/api/auth/signup", status_code=201)
async def signup(req: SignupRequest, response: Response):
    col = users_col()
    
    # Check if email exists
    existing_user = await col.find_one({"email": req.email})
    if existing_user:
        raise HTTPException(status_code=409, detail="email already registered")
    
    # Hash password
    # bcrypt.hashpw expects bytes
    password_bytes = req.password.encode('utf-8')
    salt = bcrypt.gensalt(12)
    password_hash = bcrypt.hashpw(password_bytes, salt).decode('utf-8')
    
    # Create user doc
    user_doc = {
        "name": req.name,
        "email": req.email,
        "password_hash": password_hash,
        "inferred_profile": None,
        "avatar_url": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await col.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create JWT and set cookie
    token = create_jwt(user_id)
    set_auth_cookie(response, token)
    
    return {
        "user_id": user_id,
        "name": req.name
    }

@app.post("/api/auth/login")
async def login(req: LoginRequest, response: Response):
    col = users_col()
    
    # Find user
    user = await col.find_one({"email": req.email})
    if not user:
        raise HTTPException(status_code=401, detail="invalid credentials")
    
    # Verify password
    password_bytes = req.password.encode('utf-8')
    hash_bytes = user["password_hash"].encode('utf-8')
    
    if not bcrypt.checkpw(password_bytes, hash_bytes):
        raise HTTPException(status_code=401, detail="invalid credentials")
    
    # Logged in - set cookie
    user_id = str(user["_id"])
    token = create_jwt(user_id)
    set_auth_cookie(response, token)
    
    return {
        "user_id": user_id,
        "name": user["name"]
    }

# ── Journal Routes ───────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "DayLog Backend API is running"}

@app.post("/api/journal/{user_id}/submit")
async def submit_journal(user_id: str, req: JournalSubmitRequest):
    if not req.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text cannot be empty")
    
    try:
        doc = await create_journal_entry(raw_text=req.raw_text, user_id=user_id)
        col = journals_col()
        result = await col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        
        return {
            "status": "success",
            "data": doc
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
