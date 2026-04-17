import { useState } from "react";
import {
  type Session,
  type SessionSet,
  getExercises,
  getSessions,
  getAllSessionSets,
  archiveSession,
  unarchiveSession,
  deleteArchivedSession,
} from "@/lib/storage";
import { IconUp, IconDecline, IconArchive, IconTrash } from "./icons";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface HistoryExerciseEntry {
  exerciseId: number;
  exerciseName: string;
  category: string;
  weight: number;
  repsAchieved: number;
  prevLastReps: number | null;
  weightIncreased: boolean;
}

export interface HistorySessionEntry {
  session: Session;
  exercises: HistoryExerciseEntry[];
}

// ─── Data Builders ──────────────────────────────────────────────────────────────

export function buildHistoryData(): HistorySessionEntry[] {
  const allSets = getAllSessionSets();
  const exercises = getExercises();
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  const allSessions = getSessions();
  const sessionById = new Map(allSessions.map((s) => [s.id, s]));

  const exerciseSessionWeights = new Map<number, Map<number, { weight: number; startedAt: string }>>();
  for (const set of allSets) {
    const sess = sessionById.get(set.sessionId);
    if (!sess) continue;
    if (!exerciseSessionWeights.has(set.exerciseId)) {
      exerciseSessionWeights.set(set.exerciseId, new Map());
    }
    exerciseSessionWeights.get(set.exerciseId)!.set(set.sessionId, {
      weight: set.weight,
      startedAt: sess.startedAt,
    });
  }

  const exerciseHistory = new Map<number, Array<{ sessionId: number; weight: number }>>();
  exerciseSessionWeights.forEach((sessionMap, exerciseId) => {
    const entries = Array.from(sessionMap.entries())
      .map(([sessionId, data]) => ({ sessionId, weight: data.weight, startedAt: data.startedAt }))
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime() || a.sessionId - b.sessionId);
    exerciseHistory.set(exerciseId, entries.map(({ sessionId, weight }) => ({ sessionId, weight })));
  });

  const completedSessions = allSessions
    .filter((s) => s.endedAt !== null)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime() || b.id - a.id);

  return completedSessions
    .map((session) => {
      const sessionSets = allSets.filter((s) => s.sessionId === session.id);
      if (sessionSets.length === 0) return null;

      const byExercise = new Map<number, SessionSet>();
      for (const set of sessionSets) {
        byExercise.set(set.exerciseId, set);
      }

      const exerciseEntries: HistoryExerciseEntry[] = [];
      byExercise.forEach((set, exerciseId) => {
        const exercise = exerciseMap.get(exerciseId);
        const exerciseName = exercise?.name ?? `Exercise #${exerciseId}`;
        const category = exercise?.category ?? "";

        const history = exerciseHistory.get(exerciseId) ?? [];
        const idx = history.findIndex((h) => h.sessionId === session.id);
        const prevWeight = idx > 0 ? history[idx - 1].weight : null;
        const weightIncreased = prevWeight !== null && set.weight > prevWeight;

        exerciseEntries.push({
          exerciseId,
          exerciseName,
          category,
          weight: set.weight,
          repsAchieved: set.repsAchieved,
          prevLastReps: set.prevLastReps,
          weightIncreased,
        });
      });

      return { session, exercises: exerciseEntries };
    })
    .filter((e): e is HistorySessionEntry => e !== null);
}

export function getCategorySummary(exercises: HistoryExerciseEntry[]): string | null {
  if (exercises.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const e of exercises) {
    if (e.category) counts[e.category] = (counts[e.category] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;
  const [topCat, topCount] = sorted[0];
  if (topCount === exercises.length) return `All ${topCat}`;
  if (topCount > exercises.length / 2) return `Mostly ${topCat}`;
  return null;
}

// ─── Export ────────────────────────────────────────────────────────────────────

export function generateLogText(entries: HistorySessionEntry[], weightUnit: "kg" | "lbs" = "kg"): string {
  if (entries.length === 0) return "No completed sessions.";

  const lines: string[] = ["Exercise Log", "============", ""];

  for (const entry of entries) {
    const { session, exercises } = entry;
    const startDate = new Date(session.startedAt);
    const endDate = session.endedAt ? new Date(session.endedAt) : null;

    const dateStr = startDate.toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
    });
    const timeStr = startDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const durationStr = endDate
      ? (() => { const m = Math.round((endDate.getTime() - startDate.getTime()) / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; })()
      : null;

    const catSummary = getCategorySummary(exercises);

    lines.push(`Session: ${dateStr}`);
    lines.push(`Time: ${timeStr}${durationStr ? ` · Duration: ${durationStr}` : ""} · ${exercises.length} exercise${exercises.length !== 1 ? "s" : ""}`);
    if (catSummary) lines.push(`Category: ${catSummary}`);
    lines.push("");

    for (const ex of exercises) {
      const prev = ex.prevLastReps ?? 0;
      const isUp = prev > 0 && ex.repsAchieved > prev;
      const isDown = prev > 0 && ex.repsAchieved < prev;
      const trend = isUp ? " ↑" : isDown ? " ↓" : "";
      const weightNote = ex.weightIncreased ? " (↑wt)" : "";
      lines.push(`  ${ex.exerciseName.padEnd(35)} ${ex.weight}${weightUnit} × ${ex.repsAchieved}${trend}${weightNote}`);
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function downloadLog(entries: HistorySessionEntry[], weightUnit: "kg" | "lbs" = "kg") {
  const text = generateLogText(entries, weightUnit);
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `exercise-log-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Session Log Card ───────────────────────────────────────────────────────────

function SessionLogCard({ entry, showArchive, showDelete, onArchive, onUnarchive, onDelete, weightUnit = "kg" }: {
  entry: HistorySessionEntry;
  showArchive: boolean;
  showDelete: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  weightUnit?: "kg" | "lbs";
}) {
  const { session, exercises } = entry;
  const startDate = new Date(session.startedAt);
  const endDate = session.endedAt ? new Date(session.endedAt) : null;

  const dateStr = startDate.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  const timeStr = startDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const durationStr = endDate
    ? (() => { const m = Math.round((endDate.getTime() - startDate.getTime()) / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; })()
    : "";

  const upCount = exercises.filter((e) => { const p = e.prevLastReps ?? 0; return p > 0 && e.repsAchieved > p; }).length;
  const downCount = exercises.filter((e) => { const p = e.prevLastReps ?? 0; return p > 0 && e.repsAchieved < p; }).length;
  const weightUpCount = exercises.filter((e) => e.weightIncreased).length;
  const categorySummary = getCategorySummary(exercises);

  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={{ background: "hsl(220 14% 12%)", border: "1px solid var(--color-border)", borderRadius: "14px", padding: "14px 16px", marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{dateStr}</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginTop: "2px" }}>
            {timeStr}{durationStr ? ` · ${durationStr}` : ""} · {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
          </div>
          {categorySummary && (
            <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-text-faint)", marginTop: "3px", letterSpacing: "0.03em" }}>
              {categorySummary}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", justifyContent: "flex-end", marginTop: "2px" }}>
          {upCount > 0 && (
            <span style={{ fontSize: "10px", fontWeight: 700, color: "hsl(142 70% 50%)", background: "hsl(142 50% 14%)", border: "1px solid hsl(142 40% 25%)", borderRadius: "99px", padding: "2px 8px", whiteSpace: "nowrap" }}>
              {upCount} up
            </span>
          )}
          {downCount > 0 && (
            <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-warning)", background: "hsl(25 60% 18%)", border: "1px solid hsl(25 50% 30%)", borderRadius: "99px", padding: "2px 8px", whiteSpace: "nowrap" }}>
              {downCount} down
            </span>
          )}
          {weightUpCount > 0 && (
            <span style={{ fontSize: "10px", fontWeight: 700, color: "hsl(200 70% 60%)", background: "hsl(200 50% 14%)", border: "1px solid hsl(200 40% 25%)", borderRadius: "99px", padding: "2px 8px", whiteSpace: "nowrap" }}>
              {weightUpCount} ↑ wt
            </span>
          )}
        </div>
      </div>

      <div style={{ borderTop: "1px solid hsl(220 10% 18%)", marginTop: "8px" }}>
        {exercises.map((ex) => {
          const prev = ex.prevLastReps ?? 0;
          const isUp = prev > 0 && ex.repsAchieved > prev;
          const isDown = prev > 0 && ex.repsAchieved < prev;
          return (
            <div key={ex.exerciseId} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: "1px solid hsl(220 10% 18%)" }}>
              <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--text-xs)", color: "var(--color-text)", minWidth: 0, marginRight: "8px" }}>
                {ex.exerciseName}
              </span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: "76px", textAlign: "right" }}>
                {ex.weight}{weightUnit} × {ex.repsAchieved}
              </span>
              <div style={{ width: "30px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "2px", flexShrink: 0 }}>
                {ex.weightIncreased && (
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "hsl(200 70% 60%)" }} title="Weight up from last session">↑w</span>
                )}
                {isUp && <span style={{ display: "inline-flex", color: "hsl(142 70% 50%)" }}><IconUp /></span>}
                {isDown && <span style={{ display: "inline-flex", color: "var(--color-warning)" }}><IconDecline /></span>}
              </div>
            </div>
          );
        })}
      </div>

      {showArchive && (
        <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onArchive}
            data-testid={`btn-archive-session-${session.id}`}
            style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 600, color: "var(--color-text-faint)", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-text-muted)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-text-faint)"}
          >
            <IconArchive /> Archive
          </button>
        </div>
      )}
      {showDelete && (
        <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onUnarchive}
            data-testid={`btn-unarchive-session-${session.id}`}
            style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 600, color: "var(--color-text-faint)", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-success)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-text-faint)"}
          >
            <IconArchive /> Un-archive
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {confirmDelete ? (
              <>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>Delete this log?</span>
                <button
                  onClick={onDelete}
                  data-testid={`btn-delete-session-confirm-${session.id}`}
                  style={{ fontSize: "10px", fontWeight: 700, color: "hsl(0 70% 60%)", background: "hsl(0 50% 15%)", border: "1px solid hsl(0 50% 30%)", borderRadius: "6px", padding: "3px 8px", cursor: "pointer" }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ fontSize: "10px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                data-testid={`btn-delete-session-${session.id}`}
                style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 600, color: "hsl(0 60% 55%)", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
                onMouseEnter={(e) => e.currentTarget.style.color = "hsl(0 70% 65%)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "hsl(0 60% 55%)"}
              >
                <IconTrash /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Session History Panel ──────────────────────────────────────────────────────

export function SessionHistoryPanel({ onClose, weightUnit = "kg" }: { onClose: () => void; weightUnit?: "kg" | "lbs" }) {
  const [historyData, setHistoryData] = useState<HistorySessionEntry[]>(() => buildHistoryData());
  const [view, setView] = useState<"active" | "archive">("active");

  const refresh = () => setHistoryData(buildHistoryData());

  const activeEntries = historyData.filter((e) => !e.session.archived);
  const archivedEntries = historyData.filter((e) => e.session.archived);
  const displayed = view === "active" ? activeEntries : archivedEntries;

  const handleArchive = (sessionId: number) => { archiveSession(sessionId); refresh(); };
  const handleUnarchive = (sessionId: number) => { unarchiveSession(sessionId); setView("active"); refresh(); };
  const handleDelete = (sessionId: number) => { deleteArchivedSession(sessionId); refresh(); };

  return (
    <div className="history-overlay" onClick={onClose} data-testid="history-overlay">
      <div className="history-sheet" onClick={(e) => e.stopPropagation()} data-testid="session-history-panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Session Log</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {historyData.length > 0 && (
              <button
                onClick={() => downloadLog(historyData, weightUnit)}
                data-testid="btn-download-log"
                style={{ fontSize: "var(--text-xs)", color: "var(--color-text-faint)", background: "none", border: "1px solid var(--color-border)", borderRadius: "6px", cursor: "pointer", padding: "3px 8px", fontWeight: 600 }}
              >
                Download
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "22px", lineHeight: 1, padding: "0 4px" }}
              aria-label="Close log"
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          {view === "active" ? (
            archivedEntries.length > 0 && (
              <button
                onClick={() => setView("archive")}
                data-testid="btn-view-archived"
                style={{ fontSize: "var(--text-xs)", color: "var(--color-text-faint)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px", padding: 0 }}
              >
                View archived ({archivedEntries.length})
              </button>
            )
          ) : (
            <button
              onClick={() => setView("active")}
              style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              ← Back to log
            </button>
          )}
        </div>

        {displayed.length === 0 ? (
          <p data-testid="session-log-empty" style={{ color: "var(--color-text-faint)", fontSize: "var(--text-sm)", textAlign: "center", padding: "32px 0" }}>
            {view === "active" ? "No completed sessions yet." : "No archived sessions."}
          </p>
        ) : (
          displayed.map((entry) => (
            <SessionLogCard
              key={entry.session.id}
              entry={entry}
              showArchive={view === "active"}
              showDelete={view === "archive"}
              onArchive={() => handleArchive(entry.session.id)}
              onUnarchive={() => handleUnarchive(entry.session.id)}
              onDelete={() => handleDelete(entry.session.id)}
              weightUnit={weightUnit}
            />
          ))
        )}
      </div>
    </div>
  );
}
