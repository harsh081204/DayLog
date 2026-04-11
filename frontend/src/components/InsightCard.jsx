"use client";

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

export default function InsightCard({ insight }) {
  if (!insight) return null;
  return (
    <div className={cardClass(insight.severity)}>
      <div className={styles.row}>
        <span className={styles.icon} aria-hidden>
          {iconFor(insight)}
        </span>
        <div className={styles.ct}>
          <div className={styles.cardTitle}>{insight.title}</div>
          <div className={styles.cardBody}>{insight.body}</div>
        </div>
      </div>
    </div>
  );
}
