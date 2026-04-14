import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  type Exercise,
  type Session,
  type Settings,
  initStorage,
  getExercises,
  createExercise,
  saveExercisesOrder,
  getActiveSession,
  startSession,
  endSession,
  getCategories,
  addCategory,
  deleteCategory,
  getSettings,
  saveSettings,
} from "@/lib/storage";

import { IconPlus, IconArchive, IconLog, IconSettings, IconTrash } from "@/components/icons";
import { Modal, cancelBtnStyle } from "@/components/Modal";
import { ImportButton, ExportModal } from "@/components/ImportExport";
import { SessionHistoryPanel } from "@/components/SessionHistory";
import { ExerciseCard, SortableExerciseCard } from "@/components/ExerciseCard";
import { ResetButton, SettingsPanel, AddCategoryDialog, SessionSummary, ExerciseSheet } from "@/components/Dialogs";
import type { SetLog } from "@/components/types";

// Re-export functions/types used by tests
export { computeSetOutcome } from "@/components/ExerciseCard";
export { parseImportText, buildExportText, encodeState, decodeState } from "@/components/ImportExport";
export { buildHistoryData, getCategorySummary } from "@/components/SessionHistory";
export type { HistoryExerciseEntry, HistorySessionEntry } from "@/components/SessionHistory";

// ─── Constants ──────────────────────────────────────────────────────────────────

const ARCHIVE_TAB = "Archive";

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function LiftTracker() {
  useEffect(() => { initStorage(); }, []);

  const [exercises, setExercises] = useState<Exercise[]>(() => {
    initStorage();
    return getExercises();
  });
  const [categories, setCategories] = useState<string[]>(() => {
    initStorage();
    return getCategories();
  });
  const [activeSession, setActiveSession] = useState<Session | null>(() => getActiveSession());
  const [setLogs, setSetLogs] = useState<SetLog[]>([]);
  const [activeTab, setActiveTab] = useState<string>(() => getCategories()[0] ?? "Back");
  const [showSummary, setShowSummary] = useState(false);
  const [summaryLogs, setSummaryLogs] = useState<SetLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showAddCategoryDialog, setShowAddCategoryDialog] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [droppedId, setDroppedId] = useState<number | null>(null);
  const [confirmRemoveGroup, setConfirmRemoveGroup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => getSettings());

  const handleSettingsChange = useCallback((s: Settings) => {
    saveSettings(s);
    setSettings(s);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  const refreshExercises = useCallback(() => {
    setExercises(getExercises());
  }, []);

  const refreshCategories = useCallback(() => {
    setCategories(getCategories());
  }, []);

  useEffect(() => { setConfirmRemoveGroup(false); }, [activeTab]);

  const handleRemoveCategory = () => {
    const updated = deleteCategory(activeTab);
    setCategories(updated);
    setActiveTab(updated[0] ?? "");
  };

  const isActive = !!activeSession && !activeSession.endedAt;

  const handleStartSession = () => {
    const session = startSession();
    setActiveSession(session);
    setSetLogs([]);
  };

  const handleEndSession = () => {
    if (!activeSession) return;
    endSession(activeSession.id);
    setSummaryLogs([...setLogs]);
    setShowSummary(true);
    setActiveSession(null);
    refreshExercises();
  };

  const handleAddExercise = (data: Partial<Exercise>) => {
    const category = data.category ?? categories[0] ?? "Back";
    const catExercises = exercises.filter((ex) => ex.category === category && !ex.archived);
    const maxSortOrder = catExercises.length > 0 ? Math.max(...catExercises.map((ex) => ex.sortOrder)) : -1;
    createExercise({
      name: data.name ?? "New Exercise",
      category,
      weight: data.weight ?? 0,
      maxReps: data.maxReps ?? 12,
      sets: data.sets ?? 3,
      lastReps: null,
      sortOrder: maxSortOrder + 1,
      archived: false,
    });
    refreshExercises();
    setActiveTab(category);
    setShowAddSheet(false);
  };

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    setIsReordering(true);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setIsReordering(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setExercises((prev) => {
      const catItems = prev
        .filter((ex) => ex.category === activeTab && !ex.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const oldIndex = catItems.findIndex((ex) => ex.id === active.id);
      const newIndex = catItems.findIndex((ex) => ex.id === over.id);
      const reordered = arrayMove(catItems, oldIndex, newIndex);
      saveExercisesOrder(reordered.map((ex) => ex.id));
      return getExercises();
    });
    const droppedExId = active.id as number;
    setDroppedId(droppedExId);
    setTimeout(() => setDroppedId(null), 700);
  }, [activeTab]);

  const handleSetLogged = useCallback((log: SetLog) => {
    setSetLogs((prev) => [...prev.filter((l) => l.exerciseId !== log.exerciseId), log]);
  }, []);

  const handleSetUndone = useCallback((exerciseId: number) => {
    setSetLogs((prev) => prev.filter((l) => l.exerciseId !== exerciseId));
  }, []);

  const doneCount = setLogs.length;

  const activeExercises = exercises.filter((ex) => !ex.archived);
  const archivedExercises = exercises.filter((ex) => ex.archived);

  const allCategories = [...categories];
  activeExercises.forEach((ex) => {
    if (!allCategories.some((c) => c.toLowerCase() === ex.category.toLowerCase())) {
      allCategories.push(ex.category);
    }
  });

  const filteredExercises = (activeTab === ARCHIVE_TAB
    ? archivedExercises
    : activeExercises.filter((ex) => ex.category === activeTab))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ minHeight: "100dvh" }}>
      <header className="app-header">
        <div className="header-top">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="LiftTrack" style={{ flexShrink: 0 }}>
              <rect width="28" height="28" rx="8" fill="hsl(142 71% 45%)" />
              <rect x="3" y="12" width="22" height="4" rx="2" fill="hsl(142 40% 10%)" />
              <rect x="1" y="9" width="4" height="10" rx="1.5" fill="hsl(142 40% 10%)" />
              <rect x="23" y="9" width="4" height="10" rx="1.5" fill="hsl(142 40% 10%)" />
              <rect x="5" y="7" width="3" height="14" rx="1.2" fill="hsl(142 40% 10%)" />
              <rect x="20" y="7" width="3" height="14" rx="1.2" fill="hsl(142 40% 10%)" />
            </svg>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, lineHeight: 1.1 }}>LiftTrack</div>
              {isActive && (
                <svg width="8" height="8" viewBox="0 0 8 8" style={{ flexShrink: 0 }}>
                  <circle cx="4" cy="4" r="4" fill="hsl(142 71% 45%)" />
                </svg>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setShowHistory(true)}
              title="Session log"
              data-testid="btn-open-log"
              style={{
                display: "flex", alignItems: "center", gap: "4px",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-muted)", padding: "4px 6px", borderRadius: "8px",
                fontSize: "var(--text-xs)", fontWeight: 600,
                transition: "color 150ms ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-text)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-text-muted)"}
            >
              <IconLog />
              Log
            </button>

            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              data-testid="btn-open-settings"
              aria-label="Settings"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-muted)", padding: "4px 6px", borderRadius: "8px",
                transition: "color 150ms ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-text)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-text-muted)"}
            >
              <IconSettings />
            </button>

            {!isActive ? (
              <button className="btn btn-start" onClick={handleStartSession} data-testid="btn-start-session">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z" /></svg>
                Start
              </button>
            ) : (
              <button className="btn btn-end" onClick={() => setConfirmEnd(true)} data-testid="btn-end-session">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                End
              </button>
            )}
          </div>
        </div>

        {isActive && (
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 16px 6px" }}>
            <span
              data-testid="session-counter"
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 700,
                color: doneCount > 0 ? "var(--color-success)" : "var(--color-text-muted)",
                background: doneCount > 0 ? "var(--color-success-dim)" : "var(--color-surface-2, hsl(220 12% 18%))",
                border: `1px solid ${doneCount > 0 ? "hsl(142 40% 28%)" : "var(--color-border)"}`,
                borderRadius: "99px",
                padding: "3px 10px 3px 8px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 200ms ease",
                whiteSpace: "nowrap",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {doneCount}
            </span>
          </div>
        )}

        <div className="tab-bar" data-testid="tab-bar">
          {allCategories.map((cat) => (
            <button
              key={cat}
              className={`tab-btn ${activeTab === cat ? "active-tab" : ""}`}
              onClick={() => setActiveTab(cat)}
              data-testid={`tab-${cat.toLowerCase()}`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setShowAddCategoryDialog(true)}
            data-testid="btn-add-category"
            title="Add category"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "28px", height: "28px", flexShrink: 0,
              background: "none", border: "1px solid var(--color-border)",
              borderRadius: "8px", cursor: "pointer",
              color: "var(--color-text-muted)", fontSize: "18px", lineHeight: 1,
              transition: "color 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-success)"; e.currentTarget.style.borderColor = "var(--color-success)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
          >
            +
          </button>
          <div style={{ flex: 1 }} />
          {archivedExercises.length > 0 && (
            <button
              className={`tab-btn ${activeTab === ARCHIVE_TAB ? "active-tab archive-tab-active" : "archive-tab"}`}
              onClick={() => setActiveTab(ARCHIVE_TAB)}
              data-testid="tab-archive"
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              <IconArchive />
              Archive
            </button>
          )}
        </div>
      </header>

      <main className="content">
        {filteredExercises.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--color-text-faint)" }}>
            <p style={{ fontSize: "var(--text-sm)" }}>
              {activeTab === ARCHIVE_TAB ? "No archived exercises." : `No exercises in ${activeTab} yet.`}
            </p>
            {activeTab !== ARCHIVE_TAB && (
              confirmRemoveGroup ? (
                <div style={{ marginTop: "14px", display: "flex", gap: "8px", justifyContent: "center", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Remove this group?</span>
                  <button
                    onClick={handleRemoveCategory}
                    style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "var(--text-xs)", fontWeight: 700, color: "hsl(0 70% 60%)", background: "hsl(0 50% 15%)", border: "1px solid hsl(0 50% 30%)", borderRadius: "8px", padding: "4px 10px", cursor: "pointer" }}
                    data-testid="btn-remove-group-confirm"
                  >
                    <IconTrash /> Remove
                  </button>
                  <button
                    onClick={() => setConfirmRemoveGroup(false)}
                    style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
                    data-testid="btn-remove-group-cancel"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRemoveGroup(true)}
                  style={{ marginTop: "14px", fontSize: "var(--text-xs)", fontWeight: 600, color: "hsl(0 60% 55%)", background: "none", border: "none", cursor: "pointer" }}
                  data-testid="btn-remove-group"
                >
                  Remove group
                </button>
              )
            )}
          </div>
        ) : activeTab === ARCHIVE_TAB ? (
          filteredExercises.map((ex) => (
            <ExerciseCard
              key={`${ex.id}-${activeSession?.id ?? "idle"}`}
              exercise={ex}
              isActive={false}
              sessionId={activeSession?.id ?? null}
              onSetLogged={handleSetLogged}
              onSetUndone={handleSetUndone}
              onExerciseChanged={refreshExercises}
              onTabSwitch={setActiveTab}
              settings={settings}
            />
          ))
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredExercises.map((ex) => ex.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredExercises.map((ex) => (
                <SortableExerciseCard
                  key={`${ex.id}-${activeSession?.id ?? "idle"}`}
                  exercise={ex}
                  isReordering={isReordering}
                  isDropped={droppedId === ex.id}
                  isActive={isActive && !ex.archived}
                  sessionId={activeSession?.id ?? null}
                  onSetLogged={handleSetLogged}
                  onSetUndone={handleSetUndone}
                  onExerciseChanged={refreshExercises}
                  onTabSwitch={setActiveTab}
                  settings={settings}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {activeTab !== ARCHIVE_TAB && (
          <button
            onClick={() => setShowAddSheet(true)}
            data-testid="btn-add-exercise"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              width: "100%",
              padding: "12px",
              background: "transparent",
              border: "1px dashed var(--color-border)",
              borderRadius: "14px",
              color: "var(--color-text-faint)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              cursor: "pointer",
              transition: "color 160ms ease, border-color 160ms ease",
              marginTop: "2px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-success)"; e.currentTarget.style.borderColor = "var(--color-success)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-faint)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
          >
            <IconPlus /> Add Exercise
          </button>
        )}

        {!isActive && activeTab !== ARCHIVE_TAB && (
          <p style={{ textAlign: "center", fontSize: "var(--text-xs)", color: "var(--color-text-faint)", marginTop: "4px" }}>
            Tap <strong style={{ color: "var(--color-success)" }}>Start</strong> to begin your session
          </p>
        )}

        <div className="export-import-bar">
          <button
            className="bar-btn"
            onClick={() => setShowExportModal(true)}
            data-testid="btn-export"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          <div className="bar-divider" />
          <ImportButton onImport={() => { refreshExercises(); refreshCategories(); }} />
        </div>
        <ResetButton onReset={refreshExercises} />
      </main>

      <footer className="build-footer">
        Built {new Date(__BUILD_DATE__).toLocaleString(undefined, {
          year: "numeric", month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit",
          timeZoneName: "short",
        })}
      </footer>

      {showSummary && (
        <SessionSummary logs={summaryLogs} onClose={() => setShowSummary(false)} />
      )}

      {showHistory && (
        <SessionHistoryPanel onClose={() => setShowHistory(false)} />
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showExportModal && (
        <ExportModal exercises={exercises} onClose={() => setShowExportModal(false)} />
      )}

      {confirmEnd && (
        <Modal onClose={() => setConfirmEnd(false)}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginBottom: "8px" }}>End session?</p>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: "24px" }}>
              Your logged reps will be saved and your exercises updated.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                className="btn btn-end"
                style={{ width: "100%", justifyContent: "center", padding: "12px" }}
                onClick={() => { setConfirmEnd(false); handleEndSession(); }}
                data-testid="btn-end-confirm"
              >
                End session
              </button>
              <button
                onClick={() => setConfirmEnd(false)}
                data-testid="btn-end-cancel"
                style={cancelBtnStyle}
              >
                Resume session
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showAddCategoryDialog && (
        <AddCategoryDialog
          existingCategories={categories}
          onAdd={(name) => {
            const updated = addCategory(name);
            setCategories(updated);
            setActiveTab(name);
            setShowAddCategoryDialog(false);
          }}
          onClose={() => setShowAddCategoryDialog(false)}
        />
      )}

      {showAddSheet && (
        <ExerciseSheet
          defaultCategory={activeTab !== ARCHIVE_TAB ? activeTab : undefined}
          onSave={handleAddExercise}
          onClose={() => setShowAddSheet(false)}
        />
      )}
    </div>
  );
}
