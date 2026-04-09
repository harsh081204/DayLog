import os
import motor.motor_asyncio
from dotenv import load_dotenv

# Path to the .env file in the ai-layer directory
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(parent_dir, "ai-layer", ".env")
load_dotenv(env_path)

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("MONGO_DB_NAME", "ai_habit_tracker")

client = None

async def connect_db():
    global client
    if client is None:
        client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    # Enforce unique email at the DB level to prevent race conditions
    await db["users"].create_index("email", unique=True)
    # Compound index for efficient per-user journal listing
    await db["journals"].create_index([("user_id", 1), ("created_at", -1)])
    
    return db

async def close_db():
    global client
    if client:
        client.close()
        client = None

def get_db():
    if client is None:
        raise RuntimeError("Database not connected. Call connect_db() first.")
    return client[DB_NAME]

def journals_col():
    return get_db()["journals"]

def users_col():
    return get_db()["users"]

