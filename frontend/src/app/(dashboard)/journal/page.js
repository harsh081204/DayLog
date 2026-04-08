"use client";

import { useState, useEffect, useRef } from "react";
import dashStyles from "../dashboard.module.css";
import styles from "./journal.module.css";

// Replaced mock entries with API calls directly hitting the Go backend.
export default function JournalPage() {
    const [entries, setEntries] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentEntry, setCurrentEntry] = useState(null);
    const [mode, setMode] = useState("editor"); // editor, processing, result
    const [procStep, setProcStep] = useState(0);
    const [saveStatus, setSaveStatus] = useState("saved");
    const [saveTimeout, setSaveTimeout] = useState(null);
    const editorRef = useRef(null);

    const handleType = (e) => {
        setSaveStatus("saving");
        const newText = e.target.innerText;

        // Update local state smoothly
        if (editorRef.current && currentEntry) {
            currentEntry.rawText = newText;
            setEntries([...entries]);
        }

        // Debounce hitting Go PATCH endpoint
        if (saveTimeout) clearTimeout(saveTimeout);

        const timeout = setTimeout(() => {
            if (currentEntry?.id) {
                fetch(`http://localhost:8080/api/journals/${currentEntry.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rawText: newText, title: currentEntry.title || "Draft Entry" }),
                    credentials: "omit"
                })
                    .then(res => {
                        if (res.ok) setSaveStatus("saved");
                        else setSaveStatus("error");
                    });
            }
        }, 1500);

        setSaveTimeout(timeout);
    };

    const startNewEntry = () => {
        // 1. Ask Go to create an empty draft so we get an ID
        fetch("http://localhost:8080/api/journals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "omit"
        })
            .then(res => res.json())
            .then(newDraft => {
                setEntries([newDraft, ...entries]);
                setCurrentEntry(newDraft);
                setMode("editor");
                if (editorRef.current) {
                    editorRef.current.innerText = "";
                }
            })
            .catch(console.error);
    };

    const submitEntry = () => {
        if (!currentEntry?.id) return;

        setMode("processing");
        setProcStep(1);

        // Visual steps simulator while waiting for actual AI
        let currentStep = 1;
        const interval = setInterval(() => {
            if (currentStep < 4) {
                currentStep++;
                setProcStep(currentStep);
            }
        }, 1500);

        // Call Go bridge which hits Python
        fetch(`http://localhost:8080/api/journals/${currentEntry.id}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "omit"
        })
            .then(res => res.json())
            .then(processedData => {
                clearInterval(interval);
                setProcStep(4);
                setTimeout(() => {
                    // Update Local Arrays with the fully populated parsed data
                    const updatedEntries = entries.map(e => e.id === processedData.id ? processedData : e);
                    setEntries(updatedEntries);
                    setCurrentEntry(processedData);
                    setMode("result");
                }, 600);
            })
            .catch(err => {
                clearInterval(interval);
                console.error(err);
                setMode("editor");
                alert("Failed AI Processing. Check if Python/Go is running.");
            });
    };

    // Initial Fetch of Journals
    useEffect(() => {
        fetch("http://localhost:8080/api/journals", { credentials: "omit" }) // Warning: Needs valid auth token via login if you have auth enforced
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setEntries(data);
                    if (data.length > 0) {
                        setCurrentEntry(data[0]);
                        setMode(data[0].processed ? "result" : "editor");
                    } else {
                        startNewEntry();
                    }
                }
            })
            .catch(console.error);
    }, [startNewEntry]);

    const filteredEntries = entries.filter(e =>
        (e.title && e.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (e.rawText && e.rawText.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className={styles.journalBody}>
            {/* SIDEBAR */}
            <div className={dashStyles.sidebar}>
                <div className={dashStyles.sbHead}>
                    <button className={dashStyles.sbNewBtn} onClick={startNewEntry}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        New entry
                    </button>
                    <input
                        className={dashStyles.sbSearch}
                        placeholder="Search entries..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className={dashStyles.sbEntries}>
                    {filteredEntries.map(e => {
                        const hasParsed = e.processed && e.parsed;
                        return (
                            <div
                                key={e.id}
                                className={`${dashStyles.entryItem} ${currentEntry?.id === e.id ? dashStyles.entryItemActive : ''}`}
                                onClick={() => {
                                    setCurrentEntry(e);
                                    setMode(e.processed ? "result" : "editor");
                                }}
                            >
                                <div className={dashStyles.eiDate}>{new Date(e.date).toLocaleDateString()}</div>
                                <div className={dashStyles.eiRow}>
                                    <div className={dashStyles.eiTitle} style={{ flex: 1 }}>{e.title || "Untitled"}</div>
                                    {hasParsed && e.parsed.meta && <div className={dashStyles.eiScore}>{(e.parsed.meta.productivity_score || 0).toFixed(1)}</div>}
                                </div>
                                <div className={dashStyles.eiPreview}>{e.rawText?.substring(0, 50)}...</div>

                                {hasParsed && (
                                    <div className={dashStyles.eiChips}>
                                        {e.parsed.skills_touched?.slice(0, 2).map(s => <span key={s.name} className={`${dashStyles.eiChip} ${dashStyles.eiChipG}`}>{s.name}</span>)}
                                        {e.parsed.people_met?.slice(0, 1).map(p => <span key={p} className={`${dashStyles.eiChip} ${dashStyles.eiChipB}`}>{p}</span>)}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className={styles.main}>
                {mode === "editor" && (
                    <div className={styles.editorState}>
                        <div className={styles.editorToolbar}>
                            <div className={styles.etLeft}>
                                <span className={styles.etDate}>{currentEntry?.date ? new Date(currentEntry.date).toLocaleDateString() : ""}</span>
                                <span className={`${styles.etStatus} ${saveStatus === 'saved' ? styles.etStatusSaved : styles.etStatusSaving}`}>
                                    {saveStatus}
                                </span>
                            </div>
                            <div className={styles.etRight}>
                                <button className={styles.btnFormat}><b>B</b></button>
                                <button className={styles.btnFormat}><i>I</i></button>
                                <button className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '13px' }} onClick={submitEntry}>
                                    Submit
                                </button>
                            </div>
                        </div>
                        <div className={styles.editorArea}>
                            <div
                                className={styles.editorContent}
                                contentEditable
                                onInput={handleType}
                                ref={editorRef}
                                suppressContentEditableWarning={true}
                            >
                                {currentEntry?.rawText}
                            </div>
                        </div>
                        <div className={styles.charCount}>{currentEntry?.rawText?.split(" ").filter(w => w !== "").length || 0} words</div>
                    </div>
                )}

                {mode === "processing" && (
                    <div className={styles.processingState}>
                        <div className={styles.procSpinner}></div>
                        <div className={styles.procTitle}>Processing your entry</div>
                        <p className={styles.procSub}>AI is hitting Groq right now...</p>
                        <div className={styles.procSteps}>
                            <div className={`${styles.procStep} ${procStep > 1 ? styles.procStepDone : procStep === 1 ? styles.procStepActive : ''}`}>
                                <div className={styles.procStepDot}></div>Parsing activities and events
                            </div>
                            <div className={`${styles.procStep} ${procStep > 2 ? styles.procStepDone : procStep === 2 ? styles.procStepActive : ''}`}>
                                <div className={styles.procStepDot}></div>Extracting skills and people
                            </div>
                            <div className={`${styles.procStep} ${procStep > 3 ? styles.procStepDone : procStep === 3 ? styles.procStepActive : ''}`}>
                                <div className={styles.procStepDot}></div>Scoring productivity
                            </div>
                            <div className={`${styles.procStep} ${procStep > 4 ? styles.procStepDone : procStep === 4 ? styles.procStepActive : ''}`}>
                                <div className={styles.procStepDot}></div>Writing your journal narrative
                            </div>
                        </div>
                    </div>
                )}

                {mode === "result" && currentEntry && (
                    <div className={styles.resultState}>
                        <div className={styles.resultToolbar}>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '7px 14px', fontSize: '12px' }}
                                onClick={() => setMode("editor")}
                            >
                                Edit raw
                            </button>
                            <span className={styles.resultDate}>{new Date(currentEntry.date).toLocaleDateString()}</span>
                            <button className="btn btn-green" style={{ padding: '7px 18px', fontSize: '12px' }}>
                                Saved
                            </button>
                        </div>
                        <div className={styles.resultBody}>
                            <div className={styles.resultMoodRow}>
                                <span className="badge badge-green" style={{ background: 'rgba(168,198,117,0.2)', color: '#3a5a10', padding: '6px 14px' }}>
                                    {currentEntry.parsed?.meta?.mood || "neutral"}
                                </span>
                                <span className="badge" style={{ background: 'var(--c-yellow)', color: '#7a6000', border: '1px solid rgba(33,40,68,0.1)', padding: '6px 14px' }}>
                                    productivity {(currentEntry.parsed?.meta?.productivity_score || 0).toFixed(1)}
                                </span>
                                <span className="badge" style={{ background: 'rgba(33,40,68,0.06)', color: 'var(--c-navy)', padding: '6px 14px' }}>
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
                                            <span className={`${styles.ecBadge} ${a.status === 'done' ? styles.ecDone : styles.ecPending}`}>
                                                {a.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.resultSection}>
                                <div className={styles.rsLabel}>Skills touched</div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {currentEntry.parsed?.skills_touched?.map(s => (
                                        <span key={s.name} className="badge" style={{ background: 'rgba(168,198,117,0.2)', color: '#3a5a10' }}>
                                            {s.name} {s.subtopic && `(${s.subtopic})`}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.resultSection}>
                                <div className={styles.rsLabel}>People met</div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {currentEntry.parsed?.people_met?.map(p => (
                                        <span key={p} className="badge" style={{ background: 'rgba(32,129,195,0.1)', color: '#145585' }}>{p}</span>
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
