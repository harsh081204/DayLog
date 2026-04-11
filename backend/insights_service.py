"""
Pattern insights from processed journal data (no LLM).
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from database import journals_col

MIN_ENTRIES_GLOBAL = 7
ENTRIES_NEEDED = 7

POSITIVE_MOODS = frozenset({"happy", "excited", "productive"})

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

CORRELATION_ACTIVITIES = ("gym", "social", "leisure", "study", "coding")
CORRELATION_MIN_TOTAL = 10
CORRELATION_MIN_EACH_BUCKET = 3
CORRELATION_GAP = 0.15


def _slug(s: str) -> str:
    x = re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")
    return x or "unknown"


def _entry_datetime(doc: dict[str, Any]) -> Optional[datetime]:
    raw = doc.get("created_at")
    if isinstance(raw, datetime):
        if raw.tzinfo is None:
            return raw.replace(tzinfo=timezone.utc)
        return raw.astimezone(timezone.utc)
    if isinstance(raw, str):
        try:
            d = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d.astimezone(timezone.utc)
        except ValueError:
            pass
    raw_d = doc.get("date")
    if isinstance(raw_d, str):
        try:
            d = datetime.fromisoformat(raw_d.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d.astimezone(timezone.utc)
        except ValueError:
            pass
    return None


def _productivity_score(doc: dict[str, Any]) -> Optional[float]:
    parsed = doc.get("parsed") or {}
    meta = parsed.get("meta") or {}
    v = meta.get("productivity_score")
    if isinstance(v, (int, float)):
        return float(v)
    return None


def _date_key(dt: datetime) -> date:
    return dt.astimezone(timezone.utc).date()


def _diff_calendar_days(a: date, b: date) -> int:
    return (a - b).days


def _streaks_from_date_keys(sorted_desc_keys: list[date]) -> tuple[int, int]:
    """sorted_desc_keys: newest date first (same convention as profile page)."""
    if not sorted_desc_keys:
        return 0, 0

    current = 1
    prev = sorted_desc_keys[0]
    for i in range(1, len(sorted_desc_keys)):
        d = sorted_desc_keys[i]
        if _diff_calendar_days(prev, d) == 1:
            current += 1
            prev = d
        else:
            break
    current_streak = current

    best = 0
    run = 0
    prev_d: Optional[date] = None
    for d in reversed(sorted_desc_keys):
        if prev_d is None or _diff_calendar_days(d, prev_d) == 1:
            run += 1
        else:
            run = 1
        best = max(best, run)
        prev_d = d

    return current_streak, best


def _insight(
    insight_id: str,
    itype: str,
    severity: str,
    title: str,
    body: str,
    meta: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": insight_id,
        "type": itype,
        "severity": severity,
        "title": title,
        "body": body,
        "meta": meta,
    }


def _insight_sort_key(i: dict[str, Any]) -> tuple[int, str]:
    sev = i.get("severity") or "info"
    order = {"warning": 0, "info": 1, "success": 2}
    return (order.get(sev, 1), i.get("id", ""))


async def _load_processed_journals(user_id: str, limit: int = 2500) -> list[dict[str, Any]]:
    col = journals_col()
    cursor = col.find({"user_id": user_id, "processed": True}).sort("created_at", -1).limit(limit)
    return await cursor.to_list(length=limit)


async def build_insights_response(user_id: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    col = journals_col()
    total_processed = await col.count_documents({"user_id": user_id, "processed": True})

    base = {
        "ready": total_processed >= MIN_ENTRIES_GLOBAL,
        "entry_count": total_processed,
        "insights": [],
        "updated_at": now.isoformat(),
    }
    if total_processed < MIN_ENTRIES_GLOBAL:
        base["entries_needed"] = ENTRIES_NEEDED
        return base

    all_docs = await _load_processed_journals(user_id)
    thirty_ago = now - timedelta(days=30)
    fifteen_ago = now - timedelta(days=15)

    def in_last_30(d: dict) -> bool:
        dt = _entry_datetime(d)
        return dt is not None and dt >= thirty_ago

    entries_30d = [d for d in all_docs if in_last_30(d)]
    insights: list[dict[str, Any]] = []

    # --- 1. Stale skill (all-time in all_docs, min 7 entries global already) ---
    if total_processed >= 7:
        skill_last: dict[str, datetime] = {}
        skill_count: dict[str, int] = defaultdict(int)
        skill_label: dict[str, str] = {}
        for d in all_docs:
            dt = _entry_datetime(d)
            if not dt:
                continue
            for s in (d.get("parsed") or {}).get("skills_touched") or []:
                name = (s.get("name") or "").strip()
                if not name:
                    continue
                key = name.lower()
                skill_count[key] += 1
                skill_label.setdefault(key, name)
                prev = skill_last.get(key)
                if prev is None or dt > prev:
                    skill_last[key] = dt

        stale_rows: list[tuple[str, str, int, int]] = []
        for key, cnt in skill_count.items():
            if cnt < 3:
                continue
            last = skill_last.get(key)
            if not last:
                continue
            days_since = (now.date() - last.date()).days
            if days_since <= 5:
                continue
            stale_rows.append((key, skill_label.get(key, key), cnt, days_since))
        stale_rows.sort(key=lambda x: -x[3])
        for key, label, total_count, days_since in stale_rows[:2]:
            last = skill_last[key]
            insights.append(
                _insight(
                    f"stale_skill_{_slug(key)}",
                    "stale_skill",
                    "warning",
                    f"{label} is getting rusty",
                    f"Last logged {days_since} days ago · {total_count} total sessions",
                    {
                        "skill": label,
                        "days_since": days_since,
                        "total_sessions": total_count,
                        "last_session": f"{last.strftime('%b')} {last.day}",
                    },
                )
            )

    # --- 2. Day of week (min 14 entries in 30d, each day shown needs count >= 2) ---
    if len(entries_30d) >= 14:
        by_dow: dict[int, list[float]] = defaultdict(list)
        for d in entries_30d:
            dt = _entry_datetime(d)
            sc = _productivity_score(d)
            if dt is None or sc is None:
                continue
            wd = dt.weekday()  # Mon=0
            by_dow[wd].append(sc)
        dow_avg = {wd: (sum(vals) / len(vals)) for wd, vals in by_dow.items() if len(vals) >= 2}
        all_scores_30 = [
            _productivity_score(d) for d in entries_30d if _productivity_score(d) is not None
        ]
        if len(all_scores_30) >= 14 and dow_avg:
            overall = sum(all_scores_30) / len(all_scores_30)
            worst_d = min(dow_avg.keys(), key=lambda k: dow_avg[k])
            worst_avg = dow_avg[worst_d]
            if worst_avg < overall - 0.08 and worst_d in dow_avg:
                day_name = WEEKDAY_NAMES[worst_d]
                insights.append(
                    _insight(
                        f"day_pattern_{_slug(day_name)}",
                        "day_pattern",
                        "info",
                        f"{day_name} slump detected",
                        f"Your avg on {day_name}s is {worst_avg:.2f} vs your overall {overall:.2f}.",
                        {"day": day_name, "day_avg": round(worst_avg, 2), "overall_avg": round(overall, 2)},
                    )
                )

    # --- 3. Activity correlation ---
    if len(entries_30d) >= CORRELATION_MIN_TOTAL:
        for act in CORRELATION_ACTIVITIES:
            with_a: list[float] = []
            without: list[float] = []
            for d in entries_30d:
                sc = _productivity_score(d)
                if sc is None:
                    continue
                entries = (d.get("parsed") or {}).get("entries") or []
                has_done = any(
                    (e.get("type") or "").lower() == act and (e.get("status") or "").lower() == "done"
                    for e in entries
                )
                if has_done:
                    with_a.append(sc)
                else:
                    without.append(sc)
            if len(with_a) < CORRELATION_MIN_EACH_BUCKET or len(without) < CORRELATION_MIN_EACH_BUCKET:
                continue
            aw = sum(with_a) / len(with_a)
            wo = sum(without) / len(without)
            diff = aw - wo
            if abs(diff) <= CORRELATION_GAP:
                continue
            label = act.capitalize()
            if diff > 0:
                insights.append(
                    _insight(
                        f"activity_corr_{act}_up",
                        "activity_correlation",
                        "success",
                        f"{label} days boost your output",
                        f"Avg productivity {aw:.2f} on {act} days vs {wo:.2f} on rest days. Based on {len(with_a)} sessions in the last 30 days.",
                        {
                            "activity": act,
                            "avg_with": round(aw, 2),
                            "avg_without": round(wo, 2),
                            "with_count": len(with_a),
                        },
                    )
                )
            else:
                insights.append(
                    _insight(
                        f"activity_corr_{act}_down",
                        "activity_correlation",
                        "warning",
                        f"Heavy {act} aligns with lower scores",
                        f"Avg productivity {aw:.2f} on {act} days vs {wo:.2f} otherwise.",
                        {
                            "activity": act,
                            "avg_with": round(aw, 2),
                            "avg_without": round(wo, 2),
                            "with_count": len(with_a),
                        },
                    )
                )

    # --- 4. Consistency (14-day window, min 7 entries — satisfied by global gate) ---
    if total_processed >= 7:
        cutoff = now - timedelta(days=14)
        count_14 = sum(1 for d in all_docs if (t := _entry_datetime(d)) and t >= cutoff)
        pct = (count_14 / 14.0) * 100.0
        if pct < 70.0:
            insights.append(
                _insight(
                    "consistency_14d",
                    "consistency",
                    "info",
                    f"Journaling consistency: {round(pct)}%",
                    f"{count_14} of the last 14 days logged. A daily habit unlocks better insights.",
                    {"percent": round(pct, 1), "days_logged": count_14, "window_days": 14},
                )
            )

    # --- 5. Mood trend (min 20 entries in 30d) ---
    if len(entries_30d) >= 20:

        def pos_ratio(docs: list[dict]) -> Optional[float]:
            moods: list[str] = []
            for d in docs:
                m = ((d.get("parsed") or {}).get("meta") or {}).get("mood")
                if isinstance(m, str) and m.strip():
                    moods.append(m.strip().lower())
            if len(moods) < 5:
                return None
            pos = sum(1 for m in moods if m in POSITIVE_MOODS)
            return pos / len(moods)

        first_half = [d for d in entries_30d if (t := _entry_datetime(d)) and thirty_ago <= t < fifteen_ago]
        second_half = [d for d in entries_30d if (t := _entry_datetime(d)) and t >= fifteen_ago]
        r1, r2 = pos_ratio(first_half), pos_ratio(second_half)
        if r1 is not None and r2 is not None and abs(r2 - r1) >= 0.12:
            if r2 > r1:
                insights.append(
                    _insight(
                        "mood_trend_up",
                        "mood_trend",
                        "success",
                        "Your mood is improving",
                        'More "productive" and upbeat entries in the last 15 days vs the 15 before.',
                        {"positive_ratio_first": round(r1, 2), "positive_ratio_second": round(r2, 2)},
                    )
                )
            else:
                insights.append(
                    _insight(
                        "mood_trend_down",
                        "mood_trend",
                        "warning",
                        "Mood tilted lower recently",
                        "Positive-tone entries were more common in the first half of the month than the most recent half.",
                        {"positive_ratio_first": round(r1, 2), "positive_ratio_second": round(r2, 2)},
                    )
                )

    # --- 6. Lost touch (min 10 entries that mention people) ---
    people_docs = [
        d
        for d in all_docs
        if isinstance((d.get("parsed") or {}).get("people_met"), list)
        and len((d.get("parsed") or {}).get("people_met") or []) > 0
    ]
    if len(people_docs) >= 10:
        last_seen: dict[str, datetime] = {}
        total_meets: dict[str, int] = defaultdict(int)
        for d in all_docs:
            dt = _entry_datetime(d)
            if not dt:
                continue
            for p in (d.get("parsed") or {}).get("people_met") or []:
                if not isinstance(p, str):
                    continue
                name = p.strip()
                if not name:
                    continue
                key = name.lower()
                total_meets[key] += 1
                prev = last_seen.get(key)
                if prev is None or dt > prev:
                    last_seen[key] = dt

        lost: list[tuple[str, str, int, int]] = []
        for key, cnt in total_meets.items():
            if cnt < 3:
                continue
            ls = last_seen.get(key)
            if not ls:
                continue
            days_since = (now.date() - ls.date()).days
            if days_since <= 14:
                continue
            display = next(
                (
                    p.strip()
                    for d in all_docs
                    for p in (d.get("parsed") or {}).get("people_met") or []
                    if isinstance(p, str) and p.strip().lower() == key
                ),
                key,
            )
            lost.append((key, display, cnt, days_since))
        lost.sort(key=lambda x: -x[3])
        for _key, display, cnt, days_since in lost[:2]:
            freq = "2–3 times a week" if cnt >= 8 else "1–2 times a week"
            insights.append(
                _insight(
                    f"lost_touch_{_slug(display)}",
                    "lost_touch",
                    "info",
                    f"Haven't seen {display} in {days_since} days",
                    f"You usually connect about {freq} when they're in your logs.",
                    {"person": display, "days_since": days_since, "total_meetings": cnt},
                )
            )

    # --- 7. Personal best ---
    if total_processed >= 7:
        day_to_any: dict[date, bool] = {}
        for d in all_docs:
            dt = _entry_datetime(d)
            if dt:
                day_to_any[_date_key(dt)] = True
        sorted_days = sorted(day_to_any.keys(), reverse=True)
        current_streak, best_streak = _streaks_from_date_keys(sorted_days)

        if current_streak == best_streak and best_streak >= 7:
            insights.append(
                _insight(
                    "personal_best_streak",
                    "personal_best",
                    "success",
                    f"Best streak ever: {best_streak} days",
                    "You're on a roll. Keep going.",
                    {"streak": best_streak},
                )
            )

        all_scored = [d for d in all_docs if _productivity_score(d) is not None]
        if len(all_scored) >= 7:
            all_time_avg = sum(_productivity_score(d) for d in all_scored) / len(all_scored)
            week_cut = now - timedelta(days=7)
            week_docs = [d for d in all_scored if (t := _entry_datetime(d)) and t >= week_cut]
            if len(week_docs) >= 3:
                week_avg = sum(_productivity_score(d) for d in week_docs) / len(week_docs)
                if week_avg > all_time_avg + 0.1:
                    insights.append(
                        _insight(
                            "personal_best_week",
                            "personal_best",
                            "success",
                            "Your best week yet",
                            f"Avg productivity {week_avg:.2f} this week vs your all-time avg of {all_time_avg:.2f}.",
                            {
                                "week_avg": round(week_avg, 2),
                                "all_time_avg": round(all_time_avg, 2),
                            },
                        )
                    )

    insights.sort(key=_insight_sort_key)
    base["insights"] = insights[:6]
    return base


def pick_top_insights_for_email(insights: list[dict[str, Any]], n: int = 2) -> list[dict[str, Any]]:
    """Stable ordering for a weekly digest (strongest first: warnings, then success, then info)."""
    ranked = sorted(insights, key=_insight_sort_key)
    return ranked[:n]
