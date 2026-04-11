"use client";

import styles from "./profile.module.css";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import InsightCards from "@/components/InsightCards";

const STREAK_COLORS = ["rgba(33, 40, 68, 0.07)", "rgba(168, 198, 117, 0.3)", "rgba(168, 198, 117, 0.6)", "#a8c675"];
const DONUT_COLORS = ["var(--c-blue)", "var(--c-green)", "var(--c-navy)", "var(--c-yellow)", "rgba(33,40,68,0.2)"];

const toDateKey = (value) => {
  const d = new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const startOfDay = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

const diffDays = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / (1000 * 60 * 60 * 24));

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const getInitials = (nameOrEmail = "") =>
  nameOrEmail
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || nameOrEmail.slice(0, 2).toUpperCase() || "??";

export default function ProfilePage() {
  const { user, updateUserProfile } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [draft, setDraft] = useState({ name: "", email: "" });

  useEffect(() => {
    if (user) {
      setDraft({ name: user.name || "", email: user.email || "" });
    }
  }, [user]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("http://localhost:8000/api/journals", { credentials: "include" });
        if (res.status === 401) {
          window.location.href = "/login?reason=session_expired";
          return;
        }
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message || "Failed to load profile data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const analytics = useMemo(() => {
    const totalEntries = entries.length;
    const processed = entries.filter((e) => e.processed && e.parsed);
    const scoredEntries = processed.filter(
      (e) => typeof e.parsed?.meta?.productivity_score === "number"
    );
    const avgProd = scoredEntries.length
      ? scoredEntries.reduce((sum, e) => sum + e.parsed.meta.productivity_score, 0) / scoredEntries.length
      : 0;

    const dayCount = new Map();
    entries.forEach((e) => {
      const key = toDateKey(e.date || e.created_at);
      if (key) dayCount.set(key, (dayCount.get(key) || 0) + 1);
    });

    const dateKeys = [...dayCount.keys()].sort((a, b) => (a < b ? 1 : -1));
    let currentStreak = 0;
    if (dateKeys.length) {
      let prev = new Date(dateKeys[0]);
      currentStreak = 1;
      for (let i = 1; i < dateKeys.length; i++) {
        const d = new Date(dateKeys[i]);
        if (diffDays(prev, d) === 1) {
          currentStreak += 1;
          prev = d;
        } else {
          break;
        }
      }
    }

    let bestStreak = 0;
    let run = 0;
    let prev = null;
    [...dateKeys].reverse().forEach((k) => {
      const d = new Date(k);
      if (!prev || diffDays(d, prev) === 1) run += 1;
      else run = 1;
      bestStreak = Math.max(bestStreak, run);
      prev = d;
    });

    const now = new Date();
    const streakPattern = [];
    let maxDaily = 1;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = toDateKey(d);
      const count = dayCount.get(key) || 0;
      maxDaily = Math.max(maxDaily, count);
      streakPattern.push(count);
    }
    const streakLevels = streakPattern.map((count) => {
      if (count === 0) return 0;
      return Math.min(3, Math.max(1, Math.ceil((count / maxDaily) * 3)));
    });

    const last14Scores = [...scoredEntries]
      .sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at))
      .slice(-14)
      .map((e) => ({
        score: e.parsed.meta.productivity_score,
        label: new Date(e.date || e.created_at).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1),
      }));

    const countMap = (values) => {
      const m = new Map();
      values.forEach((v) => m.set(v, (m.get(v) || 0) + 1));
      return m;
    };

    const skillsMap = new Map();
    const moodMap = new Map();
    const peopleMap = new Map();
    const activityMap = new Map();

    processed.forEach((e) => {
      (e.parsed?.skills_touched || []).forEach((s) => {
        const key = (s.name || "unknown").toLowerCase();
        skillsMap.set(key, (skillsMap.get(key) || 0) + 1);
      });
      const mood = (e.parsed?.meta?.mood || "unknown").toLowerCase();
      moodMap.set(mood, (moodMap.get(mood) || 0) + 1);
      (e.parsed?.people_met || []).forEach((p) => {
        const key = p.trim();
        if (key) peopleMap.set(key, (peopleMap.get(key) || 0) + 1);
      });
      (e.parsed?.entries || []).forEach((a) => {
        const key = (a.type || "other").toLowerCase();
        activityMap.set(key, (activityMap.get(key) || 0) + 1);
      });
    });

    const topSkills = [...skillsMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const moodDistribution = [...moodMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        pct: processed.length ? Math.round((count / processed.length) * 100) : 0,
      }));

    const peopleFrequency = [...peopleMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    const totalActivities = [...activityMap.values()].reduce((s, c) => s + c, 0);
    const activityBreakdown = [...activityMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], idx) => ({
        name,
        count,
        pct: totalActivities ? Math.round((count / totalActivities) * 100) : 0,
        color: DONUT_COLORS[idx],
      }));
    const donutGradient = activityBreakdown.length
      ? `conic-gradient(${activityBreakdown
          .reduce(
            (acc, item) => {
              const nextEnd = acc.end + item.pct;
              acc.parts.push(`${item.color} ${acc.end}% ${Math.min(nextEnd, 100)}%`);
              acc.end = nextEnd;
              return acc;
            },
            { parts: [], end: 0 }
          )
          .parts.join(", ")})`
      : "conic-gradient(rgba(33,40,68,0.2) 0% 100%)";

    const recentEntries = [...entries]
      .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        date: formatDate(e.date || e.created_at),
        title: e.title || e.narrative || (e.rawText || "Untitled").slice(0, 60),
        score: e.parsed?.meta?.productivity_score ?? null,
      }));

    const profileHint = countMap(
      processed.map((e) => e.parsed?.meta?.inferred_profile).filter(Boolean)
    );
    const topProfile = [...profileHint.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "user";

    return {
      totalEntries,
      currentStreak,
      bestStreak,
      avgProd,
      scoredCount: scoredEntries.length,
      streakLevels,
      last14Scores,
      topSkills,
      moodDistribution,
      peopleFrequency,
      activityBreakdown,
      donutGradient,
      recentEntries,
      topProfile,
    };
  }, [entries]);

  const onSaveProfile = async () => {
    setIsSaving(true);
    setSaveMessage("");
    const payload = {};
    if (draft.name.trim() !== (user?.name || "")) payload.name = draft.name.trim();
    if (draft.email.trim() !== (user?.email || "")) payload.email = draft.email.trim();
    if (!Object.keys(payload).length) {
      setSaveMessage("No changes to save.");
      setIsSaving(false);
      setIsEditing(false);
      return;
    }

    const result = await updateUserProfile(payload);
    setIsSaving(false);
    if (result.success) {
      setSaveMessage("Profile updated.");
      setIsEditing(false);
    } else {
      setSaveMessage(result.error || "Failed to update profile.");
    }
  };

  const nameValue = user?.name || user?.email || "User";
  const initials = getInitials(nameValue);
  const memberSince = entries.length
    ? new Date(
        [...entries]
          .sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at))[0]
          ?.date || Date.now()
      ).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "N/A";

  return (
    <div className={styles.page}>
      <div className={styles.profileHeader}>
        <div className={styles.avatarWrap}>
          <div className={styles.avatarLg}>{initials}</div>
          <div className={styles.avatarBadge}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>{nameValue}</div>
          <div className={styles.profileEmail}>{user?.email || "No email"}</div>
          <div className={styles.profileTags}>
            <span className={`${styles.ptag} ${styles.ptagGreen}`}>{analytics.topProfile}</span>
            <span className={`${styles.ptag} ${styles.ptagBlue}`}>{analytics.scoredCount} scored</span>
            <span className={`${styles.ptag} ${styles.ptagNavy}`}>{analytics.totalEntries} entries</span>
          </div>
          {isEditing && (
            <div className={styles.editForm}>
              <input
                className={styles.editInput}
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Name"
              />
              <input
                className={styles.editInput}
                value={draft.email}
                onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
              />
            </div>
          )}
        </div>
        <div className={styles.profileActions}>
          {!isEditing ? (
            <button
              className="btn btn-secondary"
              style={{ padding: "8px 18px", fontSize: "13px" }}
              onClick={() => setIsEditing(true)}
            >
              Edit profile
            </button>
          ) : (
            <div style={{ display: "flex", gap: "6px" }}>
              <button className="btn btn-secondary" style={{ padding: "8px 12px", fontSize: "12px" }} onClick={() => setIsEditing(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ padding: "8px 12px", fontSize: "12px" }} onClick={onSaveProfile} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
          <span className={styles.memberSince}>member since {memberSince}</span>
          {saveMessage ? <span className={styles.memberSince}>{saveMessage}</span> : null}
          {loading ? <span className={styles.memberSince}>Loading analytics...</span> : null}
          {error ? <span className={styles.memberSince}>Error: {error}</span> : null}
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={`${styles.statCard} ${styles.statCardNavy}`}>
          <div className={styles.statVal} style={{ color: "var(--c-green)" }}>{analytics.totalEntries}</div>
          <div className={styles.statLbl} style={{ color: "rgba(255,255,244,0.45)" }}>Total entries</div>
          <div className={styles.statSub} style={{ color: "rgba(255,255,244,0.25)" }}>all time</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal} style={{ color: "var(--c-navy)" }}>{analytics.currentStreak}</div>
          <div className={styles.statLbl}>Current streak</div>
          <div className={styles.statSub} style={{ color: "var(--c-green)" }}>best: {analytics.bestStreak} days</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardYellow}`}>
          <div className={styles.statVal} style={{ color: "var(--c-navy)" }}>{analytics.avgProd.toFixed(2)}</div>
          <div className={styles.statLbl}>Avg productivity</div>
          <div className={styles.statSub} style={{ color: "rgba(33, 40, 68, 0.4)" }}>scored entries</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statVal} style={{ color: "var(--c-blue)" }}>
            {analytics.topSkills.reduce((sum, item) => sum + item.count, 0)}
          </div>
          <div className={styles.statLbl}>Skills logged</div>
          <div className={styles.statSub} style={{ color: "rgba(33, 40, 68, 0.35)" }}>
            across {analytics.topSkills.length} top topics
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <InsightCards variant="profile" maxCards={6} />
      </div>

      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.secLabel}>Activity streak — last 30 days</div>
          <div className={styles.streakGrid}>
            {analytics.streakLevels.map((s, i) => (
              <div 
                key={i} 
                className={styles.streakCell} 
                style={{ background: STREAK_COLORS[s] }}
                title={`Day ${i+1}`}
              ></div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px' }}>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'rgba(33,40,68,0.3)' }}>less</span>
            {STREAK_COLORS.map(c => (
              <div key={c} style={{ width: '10px', height: '10px', borderRadius: '2px', background: c }}></div>
            ))}
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'rgba(33,40,68,0.3)' }}>more</span>
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.secLabel}>Productivity — last 14 entries</div>
          <div className={styles.prodChart}>
            <div className={styles.prodBars}>
              {analytics.last14Scores.map((item, i) => (
                <div key={i} className={styles.prodBarWrap}>
                  <div 
                    className={styles.prodBar} 
                    style={{ 
                      height: `${Math.round(item.score * 72)}px`,
                      background: item.score >= 0.7 ? 'var(--c-green)' : item.score >= 0.5 ? '#e4a000' : 'rgba(33,40,68,0.2)'
                    }}
                  />
                  <div className={styles.prodBarLbl}>{item.label}</div>
                </div>
              ))}
            </div>
            <div className={styles.prodAvgLine} style={{ top: `${Math.round((1 - analytics.avgProd) * 72)}px` }}></div>
          </div>
        </div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.secLabel}>Top skills touched</div>
          <div className={styles.skillsList}>
            {analytics.topSkills.map((s) => (
              <div key={s.name} className={styles.skillRow}>
                <div className={styles.skillName}>{s.name}</div>
                <div className={styles.skillTrack}>
                  <div
                    className={styles.skillFill}
                    style={{
                      width: `${Math.round((s.count / (analytics.topSkills[0]?.count || 1)) * 100)}%`,
                      background: "var(--c-blue)",
                    }}
                  />
                </div>
                <div className={styles.skillCount}>{s.count}</div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.secLabel}>Mood distribution</div>
          <div className={styles.moodBars}>
            {analytics.moodDistribution.map((m, idx) => (
              <div key={m.name} className={styles.moodRowItem}>
                <div className={styles.moodName}>{m.name}</div>
                <div className={styles.moodTrack}>
                  <div className={styles.moodFill} style={{ width: `${m.pct}%`, background: DONUT_COLORS[idx % DONUT_COLORS.length] }}></div>
                </div>
                <div className={styles.moodPct}>{m.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.secLabel}>People met frequency</div>
          <div className={styles.peopleGrid}>
            {analytics.peopleFrequency.map((p, idx) => (
              <div key={p.name} className={styles.personChip} title={`${p.count} times`}>
                <div className={styles.personAv} style={{ background: DONUT_COLORS[idx % DONUT_COLORS.length], color: "#fff" }}>
                  {getInitials(p.name)}
                </div>
                <div className={styles.personName}>{p.name} ({p.count})</div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.secLabel} style={{ marginBottom: '1.5rem' }}>Activity breakdown</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
             <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: analytics.donutGradient, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: '18px', background: 'white', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{analytics.totalEntries}</span>
                  <span style={{ fontSize: '7px', fontFamily: 'var(--font-mono)', color: 'rgba(33,40,68,0.4)' }}>entries</span>
                </div>
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              {analytics.activityBreakdown.map((item) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: item.color }}></div>
                  <span style={{ flex: 1 }}>{item.name}</span>
                  <span style={{ color: 'rgba(33,40,68,0.4)', fontFamily: 'var(--font-mono)' }}>{item.pct}%</span>
                </div>
              ))}
             </div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.secLabel}>Recent entries</div>
        <div className={styles.recentList}>
          {analytics.recentEntries.map((e) => (
            <div key={e.id} className={styles.recentItem}>
              <div className={styles.riDate}>{e.date}</div>
              <div className={styles.riTitle}>{e.title}</div>
              <div
                className={styles.riScore}
                style={{ color: e.score === null ? "rgba(33,40,68,0.35)" : e.score >= 0.7 ? "var(--c-green)" : e.score >= 0.5 ? "#e4a000" : "rgba(33,40,68,0.35)" }}
              >
                {e.score === null ? "--" : e.score.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
