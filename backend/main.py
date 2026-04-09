import os
import sys
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Response, Cookie, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from bson import ObjectId
from dotenv import load_dotenv

# Path to the .env file in the ai-layer directory
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(os.path.dirname(current_dir), "ai-layer", ".env")
load_dotenv(env_path)

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

# Add CORS middleware to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class JournalUpdate(BaseModel):
    rawText: Optional[str] = None
    title: Optional[str] = None

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
        samesite="lax", # "lax" is better for dev with different ports
        max_age=604800,  # 7 days
        path="/"
    )

def fix_id(doc):
    if doc and "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc

def get_user_id_from_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("user_id")
    except:
        return None

# ── Auth Routes ──────────────────────────────────────────────────────────────

@app.post("/api/auth/signup", status_code=201)
async def signup(req: SignupRequest, response: Response):
    col = users_col()
    existing_user = await col.find_one({"email": req.email})
    if existing_user:
        raise HTTPException(status_code=409, detail="email already registered")
    
    password_hash = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')
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
    token = create_jwt(user_id)
    set_auth_cookie(response, token)
    return {"user_id": user_id, "name": req.name}

@app.post("/api/auth/login")
async def login(req: LoginRequest, response: Response):
    col = users_col()
    user = await col.find_one({"email": req.email})
    if not user or not bcrypt.checkpw(req.password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="invalid credentials")
    
    user_id = str(user["_id"])
    token = create_jwt(user_id)
    set_auth_cookie(response, token)
    return {"user_id": user_id, "name": user["name"]}

@app.get("/api/auth/me")
async def get_me(token: Optional[str] = Cookie(None)):
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    
    user_id = get_user_id_from_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid token")
    
    col = users_col()
    user = await col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    
    return {
        "user_id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"]
    }

@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"status": "logged out"}

async def get_current_user_id(token: Optional[str] = Cookie(None)):
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    user_id = get_user_id_from_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid token")
    return user_id

# ── Journal CRUD Routes (Matching Frontend) ──────────────────────────────────

@app.get("/api/journals")
async def get_journals(user_id: str = Depends(get_current_user_id)):
    """Fetch all journals for a user."""
    col = journals_col()
    cursor = col.find({"user_id": user_id}).sort("created_at", -1)
    results = []
    async for doc in cursor:
        results.append(fix_id(doc))
    return results

@app.post("/api/journals")
async def create_draft(user_id: str = Depends(get_current_user_id)):
    """Create a new empty journal draft."""
    col = journals_col()
    new_doc = {
        "user_id": user_id,
        "title": "Untitled Entry",
        "rawText": "",
        "processed": False,
        "created_at": datetime.now(timezone.utc),
        "date": datetime.now(timezone.utc).isoformat()
    }
    result = await col.insert_one(new_doc)
    new_doc["id"] = str(result.inserted_id)
    del new_doc["_id"]
    return new_doc

@app.patch("/api/journals/{journal_id}")
async def update_journal(journal_id: str, update: JournalUpdate, user_id: str = Depends(get_current_user_id)):
    """Update a journal draft (autosave)."""
    col = journals_col()
    
    # Ownership check
    existing = await col.find_one({"_id": ObjectId(journal_id), "user_id": user_id})
    if not existing:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this entry")

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    await col.update_one({"_id": ObjectId(journal_id)}, {"$set": update_data})
    return {"status": "updated"}

@app.post("/api/journals/{journal_id}/submit")
async def submit_and_process_journal(journal_id: str, user_id: str = Depends(get_current_user_id)):
    """Process a journal entry using AI and save results."""
    col = journals_col()
    doc = await col.find_one({"_id": ObjectId(journal_id), "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this entry")
    
    raw_text = doc.get("rawText", "")
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Cannot process empty journal")
    
    # Process via AI Layer
    processed_data = await create_journal_entry(raw_text=raw_text, user_id=doc["user_id"])
    
    # Update the document with processed results
    update_result = {
        "processed": True,
        "parsed": processed_data["parsed"],
        "narrative": processed_data["journal_text"],
        "processed_at": datetime.now(timezone.utc)
    }
    
    await col.update_one({"_id": ObjectId(journal_id)}, {"$set": update_result})
    
    # Get the updated doc to return to frontend
    final_doc = await col.find_one({"_id": ObjectId(journal_id)})
    return fix_id(final_doc)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
