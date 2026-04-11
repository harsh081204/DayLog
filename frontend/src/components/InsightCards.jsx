"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchInsights } from "@/lib/insights";
import { dismissInsightId, loadDismissedInsightIds } from "@/lib/insightStorage";
import InsightCard from "./InsightCard";
import styles from "./insights.module.css";

function formatUpdated(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `Updated ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return "";
  }
}

export default function InsightCards({ variant = "journal", maxCards = 4, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState([]);

  useEffect(() => {
    setDismissed(loadDismissedInsightIds());
  }, []);

  const handleDismiss = useCallback((id) => {
    dismissInsightId(id);
    setDismissed(loadDismissedInsightIds());
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const payload = await fetchInsights();
      setData(payload);
    } catch (e) {
      if (e.message !== "unauthorized") {
        setError(e.message || "Could not load insights");
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const wrapClass = variant === "profile" ? `${styles.wrap} ${styles.profileWrap}` : styles.wrap;

  if (error) {
    return (
      <div className={wrapClass}>
        <div className={styles.head}>
          <span className={styles.title}>Insights</span>
        </div>
        <div className={styles.gateText} style={{ color: "rgba(180,80,80,0.9)" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={wrapClass}>
        <div className={styles.head}>
          <span className={styles.title}>Insights</span>
        </div>
        <div className={styles.gateText}>Loading patterns…</div>
      </div>
    );
  }

  const needed = data.entries_needed ?? 7;
  const count = data.entry_count ?? 0;
  const pct = Math.min(100, Math.round((count / needed) * 100));

  if (!data.ready) {
    const barChars = Array.from({ length: 7 }, (_, i) => (i < Math.min(7, count) ? "▓" : "░")).join("");
    return (
      <div className={wrapClass}>
        <div className={styles.head}>
          <span className={styles.title}>Insights</span>
        </div>
        <div className={styles.gate}>
          <div className={styles.gateText}>
            Write {needed} entries and we&apos;ll start spotting patterns in your data.
          </div>
          <div className={styles.gateSub}>
            Currently: {count} of {needed}
          </div>
          <div className={styles.bar}>
            <div className={styles.barFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.gateSub} style={{ marginTop: "0.35rem", letterSpacing: "0.12em" }}>
            {barChars}
          </div>
        </div>
        <p className={styles.subline}>After seven processed entries, cards use your last 30 days of parsed data (no extra LLM calls).</p>
      </div>
    );
  }

  const rawList = (data.insights || []).filter((i) => !dismissed.includes(i.id)).slice(0, maxCards);
  const showUpdated = variant === "profile" && data.updated_at;
  const showDismiss = variant !== "profile";

  return (
    <div className={wrapClass}>
      <div className={styles.head}>
        <span className={styles.title}>Insights</span>
        {showUpdated ? <span className={styles.updated}>{formatUpdated(data.updated_at)}</span> : null}
      </div>
      <p className={styles.subline}>Based on your last 30 days of processed entries.</p>
      {rawList.length === 0 ? (
        <div className={styles.gateText}>No strong patterns yet. Keep journaling this month.</div>
      ) : (
        <div className={styles.grid}>
          {rawList.map((insight) => (
            <InsightCard key={insight.id} insight={insight} onDismiss={showDismiss ? handleDismiss : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
