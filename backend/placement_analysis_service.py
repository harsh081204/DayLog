import json
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from database import journals_col, placement_goals_col
from ai_processer import client  # Use the same Groq client

async def analyze_placement_readiness(user_id: str) -> Dict[str, Any]:
    """
    AI-driven analysis of user journals vs placement goals.
    """
    # 1. Fetch User Goal
    goal = await placement_goals_col().find_one({"user_id": user_id})
    if not goal:
        return {"ready": False, "error": "No goal set"}

    # 2. Fetch Recent Journals (last 30 days)
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    
    cursor = journals_col().find({
        "user_id": user_id,
        "processed": True,
        "created_at": {"$gte": thirty_days_ago}
    }).sort("created_at", -1)
    
    recent_journals = await cursor.to_list(length=30)
    
    # 3. Aggregate Skills & Productivity
    skills_logged = []
    productivity_scores = []
    
    for doc in recent_journals:
        parsed = doc.get("parsed", {})
        skills_logged.extend(parsed.get("skills_touched", []))
        score = parsed.get("meta", {}).get("productivity_score")
        if score is not None:
            productivity_scores.append(score)
            
    # Deduplicate skills
    unique_skills = {}
    for s in skills_logged:
        name = s.get("name", "").lower()
        if name:
            unique_skills[name] = s.get("subtopic")

    # 4. Prepare AI Prompt
    skills_str = ", ".join([f"{k} ({v})" if v else k for k, v in unique_skills.items()])
    target_skills_str = ", ".join(goal.get("target_skills", []))
    
    prompt = f"""
    You are an expert career coach for software engineers.
    
    ## User Profile
    Current Status: {goal.get('current_status')}
    Target Role: {goal.get('target_role')}
    Target Company: {goal.get('target_company')}
    User-Manual Skills: {target_skills_str}
    
    ## Journal Data (Last 30 days)
    Skills Touched: {skills_str}
    Average Productivity: {sum(productivity_scores)/len(productivity_scores) if productivity_scores else 0.5:.2f}
    
    ## Task
    Analyze if the user is on track for their target role/company.
    
    Return a JSON object:
    {{
        "readiness_score": int (0-100),
        "analysis_snippet": "3-4 sentence summary of strengths and gaps",
        "gaps": ["skill names that are missing but critical for this company/role"],
        "next_move": "one specific actionable task for today",
        "alignment_percent": int (0-100)
    }}
    
    Keep it encouraging but realistic. If it's a Top-Tier company like Google/Amazon, be strict about DSA/System Design.
    No markdown, just raw JSON.
    """.strip()

    try:
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a professional hiring manager and career analyst."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3
        )
        
        raw_json = response.choices[0].message.content.strip()
        # Clean potential markdown
        if raw_json.startswith("```"):
            raw_json = raw_json.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            
        analysis = json.loads(raw_json)
        return {
            "ready": True,
            "goal": {
                "company": goal.get("target_company"),
                "role": goal.get("target_role")
            },
            **analysis
        }
    except Exception as e:
        print(f"Placement analysis error: {e}")
        return {
            "ready": False, 
            "error": "Failed to generate analysis",
            "fallback_next_move": "Keep logging your journey! We need more data to give you accurate insights."
        }
