import os
import sys
import asyncio
from datetime import datetime, timezone

# Add ai-layer to path to import journal_service
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ai_layer_path = os.path.join(parent_dir, "ai-layer")
sys.path.append(ai_layer_path)

from journal_service import create_journal_entry
from database import connect_db, close_db, journals_col

async def process_and_save_journal(raw_text: str, user_id: str = "default"):
    """
    Orchestrates the process:
    1. Calls the AI layer to process the text.
    2. Saves the resulting document to MongoDB.
    """
    print(f"--- Processing journal for user: {user_id} ---")
    
    # Step 1: Get the processed document from the AI layer (journal_service)
    # This now just returns the dict without saving to DB (as per recent refactor)
    doc = await create_journal_entry(raw_text=raw_text, user_id=user_id)
    
    # Step 2: Save to MongoDB
    col = journals_col()
    result = await col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    
    print(f"Successfully saved to MongoDB with ID: {doc['_id']}")
    return doc

async def main():
    # Connect to DB
    await connect_db()
    
    try:
        # Example input
        sample_text = (
            "woke up at 9, worked on the backend logic for 4 hours, "
            "had a quick coffee, then went for a walk in the park. "
            "feeling productive today!"
        )
        
        saved_doc = await process_and_save_journal(sample_text, user_id="manual_test_user")
        
        print("\n--- Saved Document Summary ---")
        print(f"Narrative: {saved_doc['journal_text']}")
        print(f"Created At: {saved_doc['created_at']}")
        
    finally:
        # Always close connection
        await close_db()

if __name__ == "__main__":
    asyncio.run(main())
