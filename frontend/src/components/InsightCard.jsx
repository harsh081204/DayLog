"use client";

import Link from "next/link";
import styles from "./insights.module.css";

function iconFor(insight) {
  const { severity, type } = insight;
  if (type === "personal_best" && insight.id?.includes("streak")) return "🎯";
  if (severity === "warning") return "⚠";
  if (severity === "success") return "↗";
  return "●";
}

function cardClass(severity) {
  if (severity === "warning") return `${styles.card} ${styles.cardWarn}`;
  if (severity === "success") return `${styles.card} ${styles.cardOk}`;
  return `${styles.card} ${styles.cardInfo}`;
}

export default function InsightCard({ insight, onDismiss }) {
  if (!insight) return null;
  const low = insight.meta?.confidence === "low";
  const dow = insight.meta?.day_index;
  const showJournalLink = insight.type === "day_pattern" && typeof dow === "number" && dow >= 0 && dow <= 6;

  return (
    <div className={cardClass(insight.severity)}>
      <div className={styles.row}>
        <span className={styles.icon} aria-hidden>
          {iconFor(insight)}
        </span>
        <div className={styles.ct}>
          <div className={styles.cardTitle}>{insight.title}</div>
          <div className={styles.cardBody}>{insight.body}</div>
          {low ? <div className={styles.confidencePill}>Low sample — treat as a hint, not a verdict.</div> : null}
          {showJournalLink ? (
            <Link href={`/journal?dow=${dow}`} className={styles.cardLink}>
              See entries on {insight.meta?.day || "this weekday"}
            </Link>
          ) : null}
          {onDismiss ? (
            <button type="button" className={styles.dismissBtn} onClick={() => onDismiss(insight.id)}>
              Hide
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
