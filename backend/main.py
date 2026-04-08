import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

# Add project root, ai-layer and database to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)
sys.path.append(os.path.join(project_root, "ai-layer"))
sys.path.append(os.path.join(project_root, "database"))

from journal_service import create_journal_entry
from database import connect_db, close_db, journals_col

# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connect to MongoDB on startup
    await connect_db()
    yield
    # Close connection on shutdown
    await close_db()

app = FastAPI(title="DayLog Backend", lifespan=lifespan)

# ── Schemas ──────────────────────────────────────────────────────────────────
class JournalSubmitRequest(BaseModel):
    raw_text: str

# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "DayLog Backend API is running"}

@app.post("/api/journal/{user_id}/submit")
async def submit_journal(user_id: str, req: JournalSubmitRequest):
    """
    Receives raw text from frontend, processes it via AI layer,
    and saves the resulting document to MongoDB.
    """
    if not req.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text cannot be empty")
    
    try:
        print(f"--- Processing journal submission for user: {user_id} ---")
        
        # 1. Process via AI Layer
        # create_journal_entry handles parsing and narrative generation
        doc = await create_journal_entry(raw_text=req.raw_text, user_id=user_id)
        
        # 2. Save to MongoDB
        col = journals_col()
        result = await col.insert_one(doc)
        
        # 3. Finalize doc for response
        doc["_id"] = str(result.inserted_id)
        
        print(f"Successfully processed and saved. ID: {doc['_id']}")
        return {
            "status": "success",
            "data": doc
        }
        
    except Exception as e:
        print(f"Error processing submission: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # User specified port 8080 or imply it from the example URL
    uvicorn.run(app, host="0.0.0.0", port=8080)
