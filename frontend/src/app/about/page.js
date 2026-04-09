import styles from "./about.module.css";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className={styles.aboutPage}>
      <div className={styles.container}>
        {/* NAV */}
        <nav className={styles.nav}>
          <Link href="/" className={styles.logo}>
            day<span>log</span>
          </Link>
          <div className={styles.navLinks}>
            <Link href="/login" className="btn btn-secondary btn-sm">Log in</Link>
          </div>
        </nav>

        {/* HEADER */}
        <header className={styles.header}>
          <span className={styles.eyebrow}>The story behind the project</span>
          <h1 className={styles.title}>
            Building a better way to <em>remember</em>.
          </h1>
          <p className={styles.introText}>
            Hi, I&apos;m Harsh, a student building <strong>Daylog</strong> — an AI tool that helps builders and students turn their raw daily notes into structured intelligence.
          </p>
        </header>

        {/* WHY */}
        <section className={styles.section}>
          <h2>Why I started this</h2>
          <p>
            I struggled with consistent journaling. Existing tools felt too complex for a quick dump of thoughts, or too simple to provide any actual insight. I wanted to see my skill growth, track who I was meeting, and understand my productivity patterns without spending an hour filling out forms.
          </p>
          <div className={styles.card}>
            <p style={{ margin: 0, fontStyle: "italic", fontSize: "15px" }}>
              &quot;I needed something that worked like my brain does — messy, fast-paced, but full of valuable data.&quot;
            </p>
          </div>
        </section>

        {/* WHAT */}
        <section className={styles.section}>
          <h2>What Daylog does</h2>
          <p>
            Daylog is designed for people who think in text. You dump your day in plain language, and our AI extracts the entities that matter.
          </p>
          <div style={{ display: "grid", gap: "1rem", marginBottom: "2rem" }}>
            <div className="card" style={{ padding: "1.25rem" }}>
              <strong style={{ display: "block", marginBottom: "0.25rem" }}>60-Second Onboarding</strong>
              <span style={{ fontSize: "14px", color: "rgba(33,40,68,0.6)" }}>Write your first entry and see it transformed into structured data instantly.</span>
            </div>
            <div className="card" style={{ padding: "1.25rem" }}>
              <strong style={{ display: "block", marginBottom: "0.25rem" }}>Skill & People Tracking</strong>
              <span style={{ fontSize: "14px", color: "rgba(33,40,68,0.6)" }}>Automatically logs every hour spent on a skill and everyone you interact with.</span>
            </div>
          </div>
        </section>

        {/* CURRENT STAGE */}
        <section className={styles.highlightCard}>
          <h3>Current stage</h3>
          <p style={{ marginBottom: 0 }}>
            This is an early version (MVP), and I&apos;m actively improving it based on feedback. If you try it, I&apos;d love your thoughts — they directly shape what I build next.
          </p>
        </section>

        {/* BUILDER */}
        <div className={styles.builderSection}>
          <div className={styles.builderAv}>H</div>
          <div className={styles.builderInfo}>
            <h4>Harsh</h4>
            <p>Student & Developer</p>
            <p style={{ marginTop: "4px", fontSize: "13px" }}>Obsessed with personal knowledge management and AI productivity.</p>
          </div>
        </div>

        {/* CTA */}
        <section className={styles.ctaBox}>
          <h2>Join the journey</h2>
          <p>Help shape the future of intelligent journaling.</p>
          <div className={styles.btnGroup}>
            <Link href="/signup" className="btn btn-green">Try the product</Link>
            <a href="mailto:feedback@daylog.ai" className="btn btn-secondary" style={{ color: "white", borderColor: "rgba(255,255,255,0.2)" }}>Give feedback</a>
          </div>
        </section>

        {/* FOOTER */}
        <footer className={styles.footer}>
          <span>© 2026 daylog</span>
          <div className={styles.footerLinks}>
            <Link href="/">Home</Link>
            <Link href="/login">Login</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
