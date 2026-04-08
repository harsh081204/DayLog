import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add the current directory so Vercel can find database, ai_processer, etc.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from journal_service import create_journal_entry


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="AI Habit Tracker", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request schema ────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    raw_text: str
    user_profile: str | None = None

@app.post("/process")
async def process_journal(req: ProcessRequest):
    from ai_processer import parse_journal_input
    from journal_service import _build_journal_text
    
    parsed = await parse_journal_input(
        raw_text=req.raw_text,
        user_profile=req.user_profile,
    )
    journal_text = _build_journal_text(req.raw_text, parsed)
    
    return {
        "parsed": parsed.model_dump(),
        "journal_text": journal_text
    }

class JournalRequest(BaseModel):
    raw_text: str
    user_id: str = "default"


# ── API routes ────────────────────────────────────────────────────────────────

@app.post("/api/journal")
async def submit_journal(req: JournalRequest):
    """Parse and save a journal entry through the AI pipeline."""
    if not req.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text cannot be empty")
    doc = await create_journal_entry(raw_text=req.raw_text, user_id=req.user_id)
    # MongoDB _id is already stringified in create_journal_entry
    return doc





# That's it! API only now.
