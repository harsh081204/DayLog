"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dashStyles from "../dashboard.module.css";
import styles from "./journal.module.css";

export default function JournalPage() {
    const [entries, setEntries] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeId, setActiveId] = useState(null); // Only track the ID
    const [mode, setMode] = useState("editor");
    const [procStep, setProcStep] = useState(0);
    const [saveStatus, setSaveStatus] = useState("saved");
    const saveTimeoutRef = useRef(null);
    const editorRef = useRef(null);

    // Derive currentEntry from the entries list and activeId
    const currentEntry = entries.find(e => e.id === activeId) || null;

    // ── Fetch all journals on mount ────────────────────────────────────────────
    const fetchJournals = useCallback(() => {
        fetch("http://127.0.0.1:8080/api/journals", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setEntries(data);
                    setActiveId(data[0].id);
                    setMode(data[0].processed ? "result" : "editor");
                }
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        fetchJournals();
    }, [fetchJournals]);

    // ── Create a new draft ────────────────────────────────────────────────────
    const startNewEntry = () => {
        fetch("http://127.0.0.1:8080/api/journals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include"
        })
            .then(res => res.json())
            .then(newDraft => {
                setEntries(prev => [newDraft, ...prev]);
                setActiveId(newDraft.id);
                setMode("editor");
            })
            .catch(console.error);
    };

    // ── Switch entry from sidebar ──────────────────────────────────────────────
    const selectEntry = (entry) => {
        setActiveId(entry.id);
        setMode(entry.processed ? "result" : "editor");
        setSaveStatus("saved");
    };

    // ── Autosave on typing ────────────────────────────────────────────────────
    const handleType = () => {
        if (!editorRef.current || !activeId) return;
        const newText = editorRef.current.innerText;
        setSaveStatus("saving");

        // Debounce save to backend — do NOT update React state here
        // (that would cause a re-render which resets the cursor)
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            fetch(`http://127.0.0.1:8080/api/journals/${activeId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rawText: newText }),
                credentials: "include"
            })
                .then(res => {
                    if (res.ok) {
                        setSaveStatus("saved");
                        // Update entries list silently so sidebar preview stays fresh
                        setEntries(prev =>
                            prev.map(e => e.id === activeId ? { ...e, rawText: newText } : e)
                        );
                    } else {
                        setSaveStatus("error");
                    }
                })
                .catch(() => setSaveStatus("error"));
        }, 1500);
    };

    // ── Submit for AI processing ───────────────────────────────────────────────
    const submitEntry = () => {
        if (!activeId) return;
        setMode("processing");
        setProcStep(1);

        let step = 1;
        const interval = setInterval(() => {
            if (step < 4) { step++; setProcStep(step); }
        }, 1500);

        fetch(`http://127.0.0.1:8080/api/journals/${activeId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include"
        })
            .then(res => res.json())
            .then(data => {
                clearInterval(interval);
                setProcStep(4);
                setTimeout(() => {
                    setEntries(prev => prev.map(e => e.id === data.id ? data : e));
                    setActiveId(data.id);
                    setMode("result");
                }, 600);
            })
            .catch(err => {
                clearInterval(interval);
                console.error(err);
                setMode("editor");
                alert("AI processing failed. Is the backend running on port 8080?");
            });
    };

    // ── Seed editor content once when entry changes (avoid cursor reset) ──────
    // key=activeId on the div causes remount, then this effect sets initial text.
    useEffect(() => {
        if (editorRef.current && currentEntry) {
            editorRef.current.innerText = currentEntry.rawText || "";
            // Place cursor at end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeId]); // Only run when switching entries

    const filteredEntries = entries.filter(e =>
        (e.title && e.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (e.rawText && e.rawText.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const wordCount = currentEntry?.rawText
        ? currentEntry.rawText.split(/\s+/).filter(Boolean).length
        : 0;

    return (
        <div className={styles.journalBody}>
            {/* ── SIDEBAR ── */}
            <div className={dashStyles.sidebar}>
                <div className={dashStyles.sbHead}>
                    <button className={dashStyles.sbNewBtn} onClick={startNewEntry}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        New entry
                    </button>
                    <input
                        className={dashStyles.sbSearch}
                        placeholder="Search entries..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className={dashStyles.sbEntries}>
                    {filteredEntries.map(e => {
                        const hasParsed = e.processed && e.parsed;
                        return (
                            <div
                                key={e.id}
                                className={`${dashStyles.entryItem} ${activeId === e.id ? dashStyles.entryItemActive : ""}`}
                                onClick={() => selectEntry(e)}
                            >
                                <div className={dashStyles.eiDate}>{new Date(e.date).toLocaleDateString()}</div>
                                <div className={dashStyles.eiRow}>
                                    <div className={dashStyles.eiTitle} style={{ flex: 1 }}>{e.title || "Untitled"}</div>
                                    {hasParsed && e.parsed.meta &&
                                        <div className={dashStyles.eiScore}>{(e.parsed.meta.productivity_score || 0).toFixed(1)}</div>
                                    }
                                </div>
                                <div className={dashStyles.eiPreview}>{(e.rawText || "").substring(0, 50)}...</div>
                                {hasParsed && (
                                    <div className={dashStyles.eiChips}>
                                        {e.parsed.skills_touched?.slice(0, 2).map(s =>
                                            <span key={s.name} className={`${dashStyles.eiChip} ${dashStyles.eiChipG}`}>{s.name}</span>
                                        )}
                                        {e.parsed.people_met?.slice(0, 1).map(p =>
                                            <span key={p} className={`${dashStyles.eiChip} ${dashStyles.eiChipB}`}>{p}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── MAIN AREA ── */}
            <div className={styles.main}>
                {mode === "editor" && (
                    <div className={styles.editorState}>
                        <div className={styles.editorToolbar}>
                            <div className={styles.etLeft}>
                                <span className={styles.etDate}>
                                    {currentEntry?.date ? new Date(currentEntry.date).toLocaleDateString() : ""}
                                </span>
                                <span className={`${styles.etStatus} ${saveStatus === "saved" ? styles.etStatusSaved : styles.etStatusSaving}`}>
                                    {saveStatus}
                                </span>
                            </div>
                            <div className={styles.etRight}>
                                <button className={styles.btnFormat}><b>B</b></button>
                                <button className={styles.btnFormat}><i>I</i></button>
                                <button
                                    className="btn btn-primary"
                                    style={{ padding: "8px 18px", fontSize: "13px" }}
                                    onClick={submitEntry}
                                >
                                    Submit
                                </button>
                            </div>
                        </div>
                        <div className={styles.editorArea}>
                            {/* key=activeId forces a full remount when switching entries,
                                which naturally loads the correct rawText and avoids cursor bugs */}
                            <div
                                key={activeId}
                                className={styles.editorContent}
                                contentEditable
                                suppressContentEditableWarning
                                onInput={handleType}
                                ref={editorRef}
                            />
                        </div>
                        <div className={styles.charCount}>{wordCount} words</div>
                    </div>
                )}

                {mode === "processing" && (
                    <div className={styles.processingState}>
                        <div className={styles.procSpinner}></div>
                        <div className={styles.procTitle}>Processing your entry</div>
                        <p className={styles.procSub}>AI is hitting Groq right now...</p>
                        <div className={styles.procSteps}>
                            {["Parsing activities and events", "Extracting skills and people", "Scoring productivity", "Writing your journal narrative"].map((label, i) => (
                                <div key={i} className={`${styles.procStep} ${procStep > i + 1 ? styles.procStepDone : procStep === i + 1 ? styles.procStepActive : ""}`}>
                                    <div className={styles.procStepDot}></div>
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {mode === "result" && currentEntry && (
                    <div className={styles.resultState}>
                        <div className={styles.resultToolbar}>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: "7px 14px", fontSize: "12px" }}
                                onClick={() => setMode("editor")}
                            >
                                Edit raw
                            </button>
                            <span className={styles.resultDate}>{new Date(currentEntry.date).toLocaleDateString()}</span>
                            <button className="btn btn-green" style={{ padding: "7px 18px", fontSize: "12px" }}>
                                Saved
                            </button>
                        </div>
                        <div className={styles.resultBody}>
                            <div className={styles.resultMoodRow}>
                                <span className="badge badge-green" style={{ background: "rgba(168,198,117,0.2)", color: "#3a5a10", padding: "6px 14px" }}>
                                    {currentEntry.parsed?.meta?.mood || "neutral"}
                                </span>
                                <span className="badge" style={{ background: "var(--c-yellow)", color: "#7a6000", border: "1px solid rgba(33,40,68,0.1)", padding: "6px 14px" }}>
                                    productivity {(currentEntry.parsed?.meta?.productivity_score || 0).toFixed(1)}
                                </span>
                                <span className="badge" style={{ background: "rgba(33,40,68,0.06)", color: "var(--c-navy)", padding: "6px 14px" }}>
                                    processed via AI
                                </span>
                            </div>
                            <div className={styles.resultNarrative}>&quot;{currentEntry.narrative}&quot;</div>

                            <div className={styles.resultSection}>
                                <div className={styles.rsLabel}>Activities ({currentEntry.parsed?.entries?.length || 0})</div>
                                <div className={styles.entriesGrid}>
                                    {currentEntry.parsed?.entries?.map((a, i) => (
                                        <div key={i} className={styles.entryCard}>
                                            <div className={styles.ecType}>{a.type}</div>
                                            <div className={styles.ecTitle}>{a.data?.subject || a.data?.what_built || "Logged Event"}</div>
                                            <div className={styles.ecMeta}>{a.time_hint || "Today"}</div>
                                            <span className={`${styles.ecBadge} ${a.status === "done" ? styles.ecDone : styles.ecPending}`}>
                                                {a.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.resultSection}>
                                <div className={styles.rsLabel}>Skills touched</div>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    {currentEntry.parsed?.skills_touched?.map(s => (
                                        <span key={s.name} className="badge" style={{ background: "rgba(168,198,117,0.2)", color: "#3a5a10" }}>
                                            {s.name}{s.subtopic && ` (${s.subtopic})`}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.resultSection}>
                                <div className={styles.rsLabel}>People met</div>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    {currentEntry.parsed?.people_met?.map(p => (
                                        <span key={p} className="badge" style={{ background: "rgba(32,129,195,0.1)", color: "#145585" }}>{p}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
