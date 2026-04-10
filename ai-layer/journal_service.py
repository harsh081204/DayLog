import json
from datetime import datetime, timezone
from ai_processer import parse_journal_input, ParsedJournal, client

# ── Journal Text Generator ───────────────────────────────────────────────────

def _build_journal_text(raw_text: str, parsed: ParsedJournal) -> str:
    """
    Generate a human-readable narrative from the parsed journal.
    This is a lightweight template-based generator — no AI call needed here.
    Later you can swap this with an LLM call if you want richer narratives.
    """
    meta = parsed.meta
    lines = []

    # Opening line
    mood_line = f"You seemed {meta.mood}." if meta.mood else ""
    score = meta.productivity_score
    if score is not None:
        if score >= 0.8:
            tone = "a highly productive day"
        elif score >= 0.5:
            tone = "a moderately productive day"
        else:
            tone = "a lighter day"
        lines.append(f"Overall, it was {tone}. {mood_line}".strip())
    elif mood_line:
        lines.append(mood_line)

    # Entries summary
    done_entries = [e for e in parsed.entries if e.status == "done"]
    pending_entries = [e for e in parsed.entries if e.status == "pending"]

    if done_entries:
        types = list({e.type for e in done_entries})
        lines.append(f"You completed activities across: {', '.join(types)}.")

    if pending_entries:
        types = list({e.type for e in pending_entries})
        lines.append(f"Planned but not yet done: {', '.join(types)}.")

    # Skills
    if parsed.skills_touched:
        skill_names = [s.name for s in parsed.skills_touched]
        lines.append(f"Skills touched today: {', '.join(skill_names)}.")

    # People
    if parsed.people_met:
        lines.append(f"You met or interacted with: {', '.join(parsed.people_met)}.")

    # Places
    if parsed.places_visited:
        lines.append(f"Places visited: {', '.join(parsed.places_visited)}.")

    return " ".join(lines) if lines else "A day in the books."


async def _build_journal_text_llm(raw_text: str, parsed: ParsedJournal) -> tuple[str, str]:
    """
    Generate a short natural-sounding narrative using Groq.
    Falls back to template text if LLM call fails.
    """
    parsed_json = json.dumps(parsed.model_dump(), ensure_ascii=True)
    prompt = (
        "You are a thoughtful journaling assistant.\n"
        "Write a short, natural summary of this day in second person ('you').\n"
        "Style constraints:\n"
        "- 3 to 5 sentences\n"
        "- warm and encouraging tone\n"
        "- mention key activities, mood, and one suggestion for tomorrow\n"
        "- do not mention JSON, schema, or that this is AI generated\n"
        "- keep it concise and human\n\n"
        f"Raw journal text:\n{raw_text}\n\n"
        f"Structured parse:\n{parsed_json}"
    )

    try:
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You write empathetic daily journal summaries in second person.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
        )
        output = (response.choices[0].message.content or "").strip()
        if output:
            return output, "llm"
    except Exception:
        # Degrade gracefully to deterministic template when LLM fails.
        pass

    return _build_journal_text(raw_text, parsed), "template_fallback"


# ── Core Service Function ────────────────────────────────────────────────────

async def create_journal_entry(
    raw_text: str,
    user_id: str = "default",
    user_profile: str | None = None,
) -> dict:
    """
    Full pipeline:
      1. Parse raw text via AI
      2. Generate journal narrative text
      3. Return the result (skipped saving to MongoDB)

    This is the ONLY function the rest of the app should call for new entries.
    """

    # Step 1: AI layer
    parsed: ParsedJournal = await parse_journal_input(
        raw_text=raw_text,
        user_profile=user_profile,
    )

    # Step 2: Generate narrative (LLM-first, deterministic fallback)
    journal_text, journal_text_source = await _build_journal_text_llm(raw_text, parsed)

    # Step 3: Build document
    doc = {
        "user_id": user_id,
        "raw_text": raw_text,
        "parsed": parsed.model_dump(),
        "journal_text": journal_text,
        "journal_text_source": journal_text_source,
        "created_at": datetime.now(timezone.utc),
    }

    # Step 3: Returns the processed document
    return doc


# ── Quick smoke test ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio
    import sys
    
    if os.getenv("ALLOW_TEST_WRITE") != "1":
        print("\n[!] Skipping DB write test. Set ALLOW_TEST_WRITE=1 to run.")
        sys.exit(0)

    async def run():

        sample = (
            "woke up at 8, did leetcode problem on trees for 2 hours, "
            "had lunch with Priya at campus canteen, went to gym (chest day), "
            "studied rate limiter concept in the evening, "
            "scrolled instagram for too long, slept at 1am"
        )

        doc = await create_journal_entry(raw_text=sample, user_id="test_user")

        print("\n── raw_text ──")
        print(doc["raw_text"])

        print("\n── journal_text ──")
        print(doc["journal_text"])

        print("\n── parsed (skills_touched) ──")
        for s in doc["parsed"]["skills_touched"]:
            print(" •", s)

        print(doc)


    asyncio.run(run())
