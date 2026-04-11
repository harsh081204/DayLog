"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dashStyles from "../dashboard.module.css";
import styles from "./journal.module.css";
import InsightCards from "@/components/InsightCards";
import { apiUrl, API_BASE } from "@/lib/api";
import { entryCanonicalMondayFirstDow, formatEntryDateShort } from "@/lib/entryDate";

const deriveEntryTitle = (rawText, fallback = "Untitled Entry") => {
    const firstLine = (rawText || "").split("\n").map((line) => line.trim()).find(Boolean);
    if (!firstLine) return fallback;
    return firstLine.length > 60 ? `${firstLine.slice(0, 60)}...` : firstLine;
};

const getDisplayTitle = (entry) => {
    const title = (entry?.title || "").trim();
    if (title && title.toLowerCase() !== "untitled entry") return title;
    const textFallback = deriveEntryTitle(entry?.rawText || "", "");
    if (textFallback) return textFallback;
    return "Untitled Entry";
};

const getActivityLabel = (activity) => {
    const data = activity?.data || {};
    return (
        data.subject ||
        data.what_built ||
        data.topic ||
        data.project ||
        data.activity ||
        data.title ||
        data.destination ||
        data.meal ||
        data.notes ||
        `${activity?.type || "activity"} update`
    );
};

const WEEKDAYS_MON0 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function JournalPageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const dowParam = searchParams.get("dow");
    const parsedDow = dowParam !== null && dowParam !== "" ? Number.parseInt(dowParam, 10) : NaN;
    const dowFilter = Number.isInteger(parsedDow) && parsedDow >= 0 && parsedDow <= 6 ? parsedDow : null;

    const [entries, setEntries] = useState([]);
    const [journalsLoaded, setJournalsLoaded] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeId, setActiveId] = useState(null);
    const [mode, setMode] = useState("editor");
    const [procStep, setProcStep] = useState(0);
    const [procElapsed, setProcElapsed] = useState(0);
    const [processError, setProcessError] = useState("");
    const [saveStatus, setSaveStatus] = useState("saved");
    const [isCreatingEntry, setIsCreatingEntry] = useState(false);
    const [insightsRefresh, setInsightsRefresh] = useState(0);
    const saveTimeoutRef = useRef(null);
    const editorRef = useRef(null);
    const procIntervalsRef = useRef([]);

    const clearProcIntervals = useCallback(() => {
        procIntervalsRef.current.forEach(clearInterval);
        procIntervalsRef.current = [];
    }, []);

    useEffect(() => () => clearProcIntervals(), [clearProcIntervals]);

    const currentEntry = entries.find((e) => e.id === activeId) || null;

    const fetchJournals = useCallback(() => {
        setEntries([]);
        setJournalsLoaded(false);
        fetch(apiUrl("/api/journals"), { credentials: "include" })
            .then((res) => {
                if (res.status === 401) {
                    window.location.href = "/login?reason=session_expired";
                    return;
                }
                return res.json();
            })
            .then((data) => {
                if (!data || !Array.isArray(data)) return;
                setEntries(data);
                if (data.length > 0) {
                    setActiveId(data[0].id);
                    setMode(data[0].processed ? "result" : "editor");
                } else {
                    setActiveId(null);
                    setMode("editor");
                }
            })
            .catch((err) => {
                console.error("Failed to fetch journals:", err);
            })
            .finally(() => setJournalsLoaded(true));
    }, []);

    useEffect(() => {
        fetchJournals();
    }, [fetchJournals]);

    const startNewEntry = () => {
        if (isCreatingEntry) return;
        setIsCreatingEntry(true);
        fetch(apiUrl("/api/journals"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
        })
            .then((res) => {
                if (res.status === 401) {
                    window.location.href = "/login?reason=session_expired";
                    return;
                }
                return res.json();
            })
            .then((newDraft) => {
                if (!newDraft) return;
                setEntries((prev) => [newDraft, ...prev]);
                setActiveId(newDraft.id);
                setMode("editor");
            })
            .catch((err) => console.error("Failed to create entry:", err))
            .finally(() => setIsCreatingEntry(false));
    };

    const selectEntry = (entry) => {
        setActiveId(entry.id);
        setMode(entry.processed ? "result" : "editor");
        setSaveStatus("saved");
        setProcessError("");
    };

    const deleteEntry = (entryId) => {
        const ok = window.confirm("Delete this journal entry permanently?");
        if (!ok) return;

        fetch(apiUrl(`/api/journals/${entryId}`), {
            method: "DELETE",
            credentials: "include",
        })
            .then((res) => {
                if (res.status === 401) {
                    window.location.href = "/login?reason=session_expired";
                    return null;
                }
                if (!res.ok) throw new Error("Failed to delete entry");
                return res.json();
            })
            .then(() => {
                setEntries((prev) => {
                    const next = prev.filter((e) => e.id !== entryId);
                    if (activeId === entryId) {
                        const nextActive = next[0];
                        setActiveId(nextActive?.id || null);
                        setMode(nextActive?.processed ? "result" : "editor");
                    }
                    return next;
                });
            })
            .catch((err) => {
                alert(err.message || "Could not delete entry");
            });
    };

    const handleType = () => {
        if (!editorRef.current || !activeId) return;
        const newText = editorRef.current.innerText;
        const newTitle = deriveEntryTitle(newText);
        setSaveStatus("saving");
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            fetch(apiUrl(`/api/journals/${activeId}`), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rawText: newText, title: newTitle }),
                credentials: "include",
            })
                .then((res) => {
                    if (res.status === 401) {
                        window.location.href = "/login?reason=session_expired";
                        return null;
                    }
                    if (!res.ok) {
                        setSaveStatus("error");
                        return null;
                    }
                    return res.json();
                })
                .then((body) => {
                    if (!body) return;
                    setSaveStatus("saved");
                    setEntries((prev) =>
                        prev.map((e) =>
                            e.id === activeId
                                ? {
                                      ...e,
                                      rawText: newText,
                                      title: newTitle,
                                      ...(body.updated_at ? { updated_at: body.updated_at } : {}),
                                  }
                                : e
                        )
                    );
                })
                .catch(() => setSaveStatus("error"));
        }, 1500);
    };

    const submitEntry = () => {
        if (!activeId) return;
        clearProcIntervals();
        setProcessError("");
        setProcElapsed(0);
        setMode("processing");
        setProcStep(1);
        let step = 1;
        const stepTimer = setInterval(() => {
            if (step < 4) {
                step += 1;
                setProcStep(step);
            }
        }, 1500);
        procIntervalsRef.current.push(stepTimer);
        const elapsedTimer = setInterval(() => setProcElapsed((s) => s + 1), 1000);
        procIntervalsRef.current.push(elapsedTimer);

        fetch(apiUrl(`/api/journals/${activeId}/submit`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
        })
            .then((res) => {
                if (res.status === 401) {
                    window.location.href = "/login?reason=session_expired";
                    return;
                }
                if (!res.ok) {
                    return res.text().then((t) => {
                        throw new Error(t || `Server returned ${res.status}`);
                    });
                }
                return res.json();
            })
            .then((data) => {
                if (!data) return;
                clearProcIntervals();
                setProcStep(4);
                setTimeout(() => {
                    setEntries((prev) => prev.map((e) => (e.id === data.id ? data : e)));
                    setActiveId(data.id);
                    setMode("result");
                    setInsightsRefresh((k) => k + 1);
                }, 600);
            })
            .catch((err) => {
                clearProcIntervals();
                console.error(err);
                setMode("editor");
                setProcessError(
                    err.message ||
                        `Could not process this entry. Check that the API is reachable (${API_BASE}).`
                );
            });
    };

    useEffect(() => {
        if (editorRef.current && currentEntry) {
            editorRef.current.innerText = currentEntry.rawText || "";
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeId]);

    const filteredEntries = entries.filter((e) => {
        const displayTitle = getDisplayTitle(e);
        const textOk =
            displayTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (e.rawText && e.rawText.toLowerCase().includes(searchTerm.toLowerCase()));
        if (!textOk) return false;
        if (dowFilter !== null) {
            const d = entryCanonicalMondayFirstDow(e);
            if (d === null || d !== dowFilter) return false;
        }
        return true;
    });

    const wordCount = currentEntry?.rawText
        ? currentEntry.rawText.split(/\s+/).filter(Boolean).length
        : 0;

    const needsReprocess =
        currentEntry?.processed &&
        currentEntry?.updated_at &&
        currentEntry?.processed_at &&
        new Date(currentEntry.updated_at) > new Date(currentEntry.processed_at);

    const toolbarDate = currentEntry ? formatEntryDateShort(currentEntry) : "";

    return (
        <div className={styles.journalBody}>
            <div className={dashStyles.sidebar}>
                <div className={dashStyles.sbHead}>
                    <button
                        className={dashStyles.sbNewBtn}
                        onClick={startNewEntry}
                        disabled={isCreatingEntry}
                        style={{
                            opacity: isCreatingEntry ? 0.6 : 1,
                            cursor: isCreatingEntry ? "not-allowed" : "pointer",
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        New entry
                    </button>
                    <input
                        className={dashStyles.sbSearch}
                        placeholder="Search entries..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {dowFilter !== null ? (
                        <div className={styles.filterChip}>
                            <span>{WEEKDAYS_MON0[dowFilter]}s only</span>
                            <button type="button" className={styles.filterChipBtn} onClick={() => router.replace("/journal")}>
                                Clear
                            </button>
                        </div>
                    ) : null}
                </div>
                <div className={dashStyles.sbEntries}>
                    {filteredEntries.map((e) => {
                        const hasParsed = e.processed && e.parsed;
                        return (
                            <div
                                key={e.id}
                                className={`${dashStyles.entryItem} ${activeId === e.id ? dashStyles.entryItemActive : ""}`}
                                onClick={() => selectEntry(e)}
                            >
                                <div className={dashStyles.eiDate}>{formatEntryDateShort(e)}</div>
                                <div className={dashStyles.eiRow}>
                                    <div className={dashStyles.eiTitle} style={{ flex: 1 }}>
                                        {getDisplayTitle(e)}
                                    </div>
                                    {hasParsed && e.parsed.meta && (
                                        <div className={dashStyles.eiScore}>
                                            {(e.parsed.meta.productivity_score || 0).toFixed(1)}
                                        </div>
                                    )}
                                    <button
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            deleteEntry(e.id);
                                        }}
                                        title="Delete entry"
                                        style={{
                                            marginLeft: "6px",
                                            border: "1px solid rgba(33,40,68,0.12)",
                                            borderRadius: "6px",
                                            width: "22px",
                                            height: "22px",
                                            background: "white",
                                            color: "rgba(33,40,68,0.5)",
                                            cursor: "pointer",
                                            fontSize: "12px",
                                            lineHeight: 1,
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className={dashStyles.eiPreview}>{(e.rawText || "").substring(0, 50)}...</div>
                                {hasParsed && (
                                    <div className={dashStyles.eiChips}>
                                        {e.parsed.skills_touched?.slice(0, 2).map((s) => (
                                            <span key={s.name} className={`${dashStyles.eiChip} ${dashStyles.eiChipG}`}>
                                                {s.name}
                                            </span>
                                        ))}
                                        {e.parsed.people_met?.slice(0, 1).map((p) => (
                                            <span key={p} className={`${dashStyles.eiChip} ${dashStyles.eiChipB}`}>
                                                {p}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className={styles.main}>
                {journalsLoaded && entries.length === 0 && (
                    <div className={styles.onboarding}>
                        <div className={styles.onboardingTitle}>Start your first entry</div>
                        <p className={styles.onboardingText}>
                            Write freely; when you submit, we parse activities, mood, and productivity. After{" "}
                            <strong>seven processed entries</strong>, DayLog surfaces automatic pattern cards (no extra
                            AI cost).
                        </p>
                        <button type="button" className="btn btn-primary" onClick={startNewEntry} disabled={isCreatingEntry}>
                            New entry
                        </button>
                    </div>
                )}

                {journalsLoaded && entries.length === 0 ? null : mode === "editor" && currentEntry ? (
                    <div className={styles.editorState}>
                        <div className={styles.editorToolbar}>
                            <div className={styles.etLeft}>
                                <span className={styles.etDate}>{toolbarDate}</span>
                                <span
                                    className={`${styles.etStatus} ${
                                        saveStatus === "saved" ? styles.etStatusSaved : styles.etStatusSaving
                                    }`}
                                >
                                    {saveStatus}
                                </span>
                            </div>
                            <div className={styles.etRight}>
                                <button className={styles.btnFormat}>
                                    <b>B</b>
                                </button>
                                <button className={styles.btnFormat}>
                                    <i>I</i>
                                </button>
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
                ) : null}

                {mode === "processing" && (
                    <div className={styles.processingState}>
                        <div className={styles.procSpinner}></div>
                        <div className={styles.procTitle}>Processing your entry</div>
                        <p className={styles.procSub}>AI is hitting Groq right now...</p>
                        <p className={styles.procMeta}>{procElapsed}s elapsed</p>
                        <div className={styles.procSteps}>
                            {[
                                "Parsing activities and events",
                                "Extracting skills and people",
                                "Scoring productivity",
                                "Writing your journal narrative",
                            ].map((label, i) => (
                                <div
                                    key={i}
                                    className={`${styles.procStep} ${
                                        procStep > i + 1 ? styles.procStepDone : procStep === i + 1 ? styles.procStepActive : ""
                                    }`}
                                >
                                    <div className={styles.procStepDot}></div>
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {processError && mode === "editor" && currentEntry ? (
                    <div className={styles.procFail}>
                        <div className={styles.procFailTitle}>Processing failed</div>
                        <p className={styles.procFailMsg}>{processError}</p>
                        <div className={styles.procActions}>
                            <button type="button" className="btn btn-primary" style={{ fontSize: "12px" }} onClick={submitEntry}>
                                Retry
                            </button>
                        </div>
                    </div>
                ) : null}

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
                            <span className={styles.resultDate}>{toolbarDate}</span>
                            <button className="btn btn-green" style={{ padding: "7px 18px", fontSize: "12px" }}>
                                Saved
                            </button>
                        </div>
                        <div className={styles.resultBody}>
                            {needsReprocess ? (
                                <div className={styles.reprocessBanner}>
                                    <span>You edited the raw text after the last AI run.</span>
                                    <button type="button" className="btn btn-primary" style={{ fontSize: "12px" }} onClick={submitEntry}>
                                        Re-run AI
                                    </button>
                                </div>
                            ) : null}
                            <div className={styles.resultMoodRow}>
                                <span
                                    className="badge badge-green"
                                    style={{
                                        background: "rgba(168,198,117,0.2)",
                                        color: "#3a5a10",
                                        padding: "6px 14px",
                                    }}
                                >
                                    {currentEntry.parsed?.meta?.mood || "neutral"}
                                </span>
                                <span
                                    className="badge"
                                    style={{
                                        background: "var(--c-yellow)",
                                        color: "#7a6000",
                                        border: "1px solid rgba(33,40,68,0.1)",
                                        padding: "6px 14px",
                                    }}
                                >
                                    productivity {(currentEntry.parsed?.meta?.productivity_score || 0).toFixed(1)}
                                </span>
                                <span
                                    className="badge"
                                    style={{ background: "rgba(33,40,68,0.06)", color: "var(--c-navy)", padding: "6px 14px" }}
                                >
                                    processed via AI
                                </span>
                                <span
                                    className="badge"
                                    style={{ background: "rgba(32,129,195,0.1)", color: "#145585", padding: "6px 14px" }}
                                >
                                    narrative {currentEntry.narrative_source === "llm" ? "llm" : "fallback"}
                                </span>
                            </div>
                            <div className={styles.rsLabel} style={{ marginTop: "-8px", marginBottom: "14px" }}>
                                {currentEntry.parsed?.meta?.productivity_reason ||
                                    "Score combines completed activities and activity mix."}
                            </div>
                            <div className={styles.resultNarrative}>&quot;{currentEntry.narrative}&quot;</div>

                            <div className={styles.resultSection}>
                                <div className={styles.rsLabel}>Activities ({currentEntry.parsed?.entries?.length || 0})</div>
                                <div className={styles.entriesGrid}>
                                    {currentEntry.parsed?.entries?.map((a, i) => (
                                        <div key={i} className={styles.entryCard}>
                                            <div className={styles.ecType}>{a.type}</div>
                                            <div className={styles.ecTitle}>{getActivityLabel(a)}</div>
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
                                    {currentEntry.parsed?.skills_touched?.map((s) => (
                                        <span key={s.name} className="badge" style={{ background: "rgba(168,198,117,0.2)", color: "#3a5a10" }}>
                                            {s.name}
                                            {s.subtopic && ` (${s.subtopic})`}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.resultSection}>
                                <div className={styles.rsLabel}>People met</div>
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    {currentEntry.parsed?.people_met?.map((p) => (
                                        <span key={p} className="badge" style={{ background: "rgba(32,129,195,0.1)", color: "#145585" }}>
                                            {p}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <InsightCards maxCards={3} refreshKey={insightsRefresh} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function JournalPage() {
    return (
        <Suspense
            fallback={
                <div className={styles.journalBody}>
                    <div className={styles.main} style={{ padding: "2rem", color: "rgba(33,40,68,0.45)" }}>
                        Loading journal…
                    </div>
                </div>
            }
        >
            <JournalPageInner />
        </Suspense>
    );
}
