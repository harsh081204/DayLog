"use client";

import { useState, useEffect } from "react";
import styles from "./placement.module.css";
import { apiUrl } from "@/lib/api";

export default function PlacementPage() {
    const [goal, setGoal] = useState({
        target_company: "",
        target_role: "",
        current_status: "student", // default
        target_skills: []
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [skillInput, setSkillInput] = useState("");

    const [analysis, setAnalysis] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    const fetchAnalysis = async () => {
        setLoadingAnalysis(true);
        try {
            const res = await fetch(apiUrl("/api/placement/analysis"), { credentials: "include" });
            const data = await res.json();
            if (data.ready) {
                setAnalysis(data);
            }
        } catch (err) {
            console.error("Analysis fetch failed:", err);
        } finally {
            setLoadingAnalysis(false);
        }
    };

    useEffect(() => {
        // Fetch current goal on mount
        fetch(apiUrl("/api/placement/goal"), { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data && data.target_company) {
                    setGoal(data);
                    fetchAnalysis();
                }
            })
            .catch(err => console.error("Failed to load placement goal:", err))
            .finally(() => setLoading(false));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setSaved(false);
        setError("");

        try {
            const res = await fetch(apiUrl("/api/placement/goal"), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(goal),
                credentials: "include"
            });

            if (!res.ok) throw new Error("Failed to save your goal");

            const savedGoal = await res.json();
            setGoal(savedGoal);
            setSaved(true);

            // Re-fetch analysis for the new goal
            fetchAnalysis();

            // Clear success message after 3 seconds
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            setError(err.message || "An error occurred");
        } finally {
            setSaving(false);
        }
    };

    const handleAddSkill = (e) => {
        if (e.key === 'Enter' && skillInput.trim()) {
            e.preventDefault();
            if (!goal.target_skills.includes(skillInput.trim())) {
                setGoal({ ...goal, target_skills: [...goal.target_skills, skillInput.trim()] });
            }
            setSkillInput("");
        }
    };

    const removeSkill = (sk) => {
        setGoal({ ...goal, target_skills: goal.target_skills.filter(s => s !== sk) });
    };

    if (loading) {
        return (
            <div className={styles.container} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔦</div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'rgba(33,40,68,0.5)' }}>Searching for your goals...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Career Destination</h1>
                <p className={styles.subtitle}>
                    Define your target company and role. We&apos;ll use your journal data to build your personal prep roadmap.
                </p>
            </header>

            <div className={styles.grid}>
                {/* SETTINGS SECTION - REFINED FOR BETTER UX */}
                <div className={styles.formSection}>
                    <div className="card" style={{ padding: '2rem' }}>
                        <div className="section-label" style={{ marginBottom: '1.5rem' }}>Goal Settings</div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Target Company</label>
                                <div className={styles.inputWithIcon}>
                                    <span className={styles.inputIcon}>🏢</span>
                                    <input
                                        className="input"
                                        style={{ paddingLeft: '2.5rem' }}
                                        placeholder="e.g. Google, Atlassian, Zomato"
                                        value={goal.target_company}
                                        onChange={(e) => setGoal({ ...goal, target_company: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Target Role</label>
                                <div className={styles.inputWithIcon}>
                                    <span className={styles.inputIcon}>💻</span>
                                    <input
                                        className="input"
                                        style={{ paddingLeft: '2.5rem' }}
                                        placeholder="e.g. SDE Intern, Frontend Engineer"
                                        value={goal.target_role}
                                        onChange={(e) => setGoal({ ...goal, target_role: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Current Status</label>
                                <div className={styles.statusOptions}>
                                    {[
                                        { id: "student", label: "Student", desc: "1st or 2nd year", icon: "🎓" },
                                        { id: "final_year", label: "Final Year", desc: "Placements ongoing", icon: "🚀" },
                                        { id: "fresher", label: "Fresher", desc: "Graduated/Job hunting", icon: "🔍" },
                                        { id: "working", label: "Pro", desc: "Switching jobs", icon: "💼" }
                                    ].map(opt => (
                                        <div
                                            key={opt.id}
                                            className={`${styles.statusOption} ${goal.current_status === opt.id ? styles.statusOptionActive : ""}`}
                                            onClick={() => setGoal({ ...goal, current_status: opt.id })}
                                        >
                                            <span style={{ fontSize: '1.2rem' }}>{opt.icon}</span>
                                            <span className={styles.statusLabel}>{opt.label}</span>
                                            <span className={styles.statusDesc}>{opt.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Essential Skills</label>
                                <div className={styles.inputWithIcon}>
                                    <span className={styles.inputIcon}>⚡</span>
                                    <input
                                        className="input"
                                        style={{ paddingLeft: '2.5rem' }}
                                        placeholder="Add skill (e.g. DP, React) & press Enter"
                                        value={skillInput}
                                        onChange={(e) => setSkillInput(e.target.value)}
                                        onKeyDown={handleAddSkill}
                                    />
                                </div>
                                <div className={styles.skillsList}>
                                    {goal.target_skills?.map(sk => (
                                        <span key={sk} className={styles.skillItem}>
                                            {sk}
                                            <span onClick={() => removeSkill(sk)} className={styles.removeSkill}>×</span>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginTop: '0.5rem' }}>
                                {saved && <div className={styles.successMsg}>✨ Destination updated!</div>}
                                {error && <div className="error" style={{ color: 'var(--c-error)', marginBottom: '1rem' }}>{error}</div>}
                                <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '48px', fontSize: '16px' }} disabled={saving}>
                                    {saving ? "Updating Goal..." : (goal.id ? "Update My Destination" : "Save My Goal")}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="card-yellow" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ fontSize: '2rem' }}>💡</div>
                        <div>
                            <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.25rem' }}>Personalized Prep</h4>
                            <p style={{ fontSize: '12px', color: 'rgba(33, 40, 68, 0.7)', lineHeight: '1.4' }}>
                                We analyze your daily logs to find "Productivity Gaps" in your technical preparation.
                            </p>
                        </div>
                    </div>
                </div>

                {/* INSIGHTS PREVIEW SECTION */}
                <div className={styles.insightsSection}>
                    <div className="section-label">Your Roadmap</div>

                    {!goal.target_company || !goal.target_role ? (
                        <div className={styles.emptyState} style={{ height: 'calc(100% - 30px)' }}>
                            <span className={styles.emptyIcon}>📍</span>
                            <h3>Set your destination</h3>
                            <p>Tell us where you want to go, and we&apos;ll build your personalized roadmap.</p>
                        </div>
                    ) : (
                        <div className="card-navy" style={{ padding: '2rem', position: 'relative' }}>
                            {loadingAnalysis && (
                                <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontSize: '10px', opacity: 0.5 }}>
                                    Crunching data...
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <span className="badge badge-accent" style={{ background: 'var(--c-cream)', color: 'var(--c-navy)' }}>
                                    {analysis ? "Personal Roadmap" : "Draft Roadmap"}
                                </span>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '10px', opacity: 0.6, textTransform: 'uppercase' }}>Prep Score</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--c-green)' }}>
                                        {analysis ? `${analysis.readiness_score}%` : "--%"}
                                    </div>
                                </div>
                            </div>

                            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '1rem', fontSize: '1.8rem' }}>
                                Preparing for <br /><strong>{goal.target_role}</strong> <br /><span style={{ opacity: 0.6, fontSize: '1.2rem' }}>at</span> {goal.target_company}
                            </h3>

                            <div style={{ margin: '1.5rem 0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                                    <span>Preparation alignment</span>
                                    <span>{analysis ? (analysis.alignment_percent > 70 ? "High" : "Average") : "analyzing..."}</span>
                                </div>
                                <div style={{ height: '6px', background: 'rgba(255,255,244,0.1)', borderRadius: '3px' }}>
                                    <div style={{ 
                                        height: '100%', 
                                        width: analysis ? `${analysis.alignment_percent}%` : '20%', 
                                        background: 'var(--c-green)', 
                                        borderRadius: '3px',
                                        transition: 'width 0.8s ease'
                                    }}></div>
                                </div>
                            </div>

                            <div style={{ background: 'rgba(255,255,244,0.05)', padding: '1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '2rem' }}>
                                <p style={{ fontSize: '13px', lineHeight: '1.6' }}>
                                    {analysis ? analysis.analysis_snippet : "We are analyzing your recent activities. Your personalized breakdown will appear shortly."}
                                </p>
                            </div>

                            <div style={{ padding: '1rem 0', borderTop: '1px solid rgba(255,255,244,0.1)' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '1.2rem' }}>🎯</span>
                                    <div style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Next Move Suggestion
                                    </div>
                                </div>
                                <p style={{ fontSize: '14px' }}>
                                    {analysis ? analysis.next_move : "Keep logging your journey! We need more data to give you accurate insights."}
                                </p>
                            </div>

                            {analysis?.gaps?.length > 0 && (
                                <div style={{ marginTop: '1.5rem' }}>
                                    <div style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                        Key Gaps Identified
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {analysis.gaps.map(gap => (
                                            <span key={gap} className="badge" style={{ background: 'rgba(217,64,64,0.2)', color: '#ff9999', fontSize: '10px' }}>
                                                {gap}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button 
                                onClick={fetchAnalysis}
                                className="btn btn-accent" 
                                style={{ marginTop: '1.5rem', width: '100%', background: 'transparent', border: '1px solid rgba(255,255,244,0.3)' }}
                                disabled={loadingAnalysis}
                            >
                                {loadingAnalysis ? "Analyzing..." : "Refresh Analysis"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
