// ─── Full-history JSON export ────────────────────────────────────────────────
// Builds a single JSON file containing every logged set, meant to be handed to
// Claude for analysis, and delivers it via the Web Share API (iOS share sheet)
// with a plain download as the fallback.

import {
  type SessionSet,
  getSessions,
  getAllSessionSets,
  getExercises,
  getSettings,
  toIsoWithOffset,
} from "./storage";

export const GYM_LOG_SCHEMA = 1;

export interface GymLogSet {
  // Weight in kilograms. For dumbbell exercises this is per hand (the weight of
  // one dumbbell), and 0 means bodyweight (e.g. pull ups, dips).
  kg: number;
  reps: number;
  t: string | null; // when the set was logged (ISO 8601 with offset); null for legacy data
}

export interface GymLogExercise {
  name: string;
  sets: GymLogSet[];
}

export interface GymLogSession {
  id: string;
  start: string;
  end: string | null;
  category: string;
  legacy: boolean; // true = recorded before per-set logging; sets have t: null
  exercises: GymLogExercise[];
}

export interface GymLogExport {
  schema: typeof GYM_LOG_SCHEMA;
  exportedAt: string;
  sessionCount: number;
  sessions: GymLogSession[];
}

const LBS_TO_KG = 0.45359237;

/** "All Chest" when every exercise is in one group, "Mostly Chest" for a majority, else null. */
export function getCategorySummary(exercises: { category: string }[]): string | null {
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

/** gym-log-YYYYMMDD-HHMMSS.json in local time, so filenames sort chronologically. */
export function gymLogFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `gym-log-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;
}

/**
 * Every session that has at least one logged set (archived and in-progress
 * sessions included), oldest first, with every set in the order it was logged.
 */
export function buildGymLogExport(now: Date = new Date()): GymLogExport {
  const exerciseMap = new Map(getExercises().map((e) => [e.id, e]));
  const toKg = getSettings().weightUnit === "lbs"
    ? (w: number) => Math.round(w * LBS_TO_KG * 100) / 100
    : (w: number) => w;

  const setsBySession = new Map<number, SessionSet[]>();
  for (const set of getAllSessionSets()) {
    if (!setsBySession.has(set.sessionId)) setsBySession.set(set.sessionId, []);
    setsBySession.get(set.sessionId)!.push(set);
  }

  const sessions = getSessions()
    .filter((s) => setsBySession.has(s.id))
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime() || a.id - b.id)
    .map((session): GymLogSession => {
      const byExercise = new Map<number, SessionSet[]>();
      for (const set of setsBySession.get(session.id)!) {
        if (!byExercise.has(set.exerciseId)) byExercise.set(set.exerciseId, []);
        byExercise.get(set.exerciseId)!.push(set);
      }
      const exerciseIds = [...byExercise.keys()];
      const category = getCategorySummary(
        exerciseIds.map((id) => ({ category: exerciseMap.get(id)?.category ?? "" }))
      );
      return {
        id: `${session.id}-${new Date(session.startedAt).getTime()}`,
        start: toIsoWithOffset(new Date(session.startedAt)),
        end: session.endedAt ? toIsoWithOffset(new Date(session.endedAt)) : null,
        category: category ?? "Mixed",
        legacy: session.legacy === true,
        exercises: exerciseIds.map((id) => ({
          name: exerciseMap.get(id)?.name ?? `Exercise #${id}`,
          sets: byExercise.get(id)!.map((s) => ({
            kg: toKg(s.weight),
            reps: Math.round(s.repsAchieved),
            t: s.t ?? null,
          })),
        })),
      };
    });

  return {
    schema: GYM_LOG_SCHEMA,
    exportedAt: toIsoWithOffset(now),
    sessionCount: sessions.length,
    sessions,
  };
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "failed";

function downloadFile(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Share a file via navigator.share, falling back to a download.
 *
 * navigator.share() is called synchronously, so this must be invoked directly
 * from a click handler with no await before it — otherwise iOS Safari drops
 * the user activation and rejects the share.
 *
 * If application/json files aren't shareable, retries as text/plain (keeping
 * the .json name). A user cancel (AbortError) resolves to "cancelled" without
 * calling onError; any other share failure calls onError and falls back to a
 * download.
 */
export function shareOrDownloadFile(
  content: string,
  filename: string,
  onError?: (err: unknown) => void,
): Promise<ShareOutcome> {
  const canShareFile = (f: File) => {
    try {
      return typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [f] });
    } catch {
      return false;
    }
  };

  const file = ["application/json", "text/plain"]
    .map((type) => new File([content], filename, { type }))
    .find(canShareFile);

  if (!file) {
    downloadFile(content, filename, "application/json");
    return Promise.resolve("downloaded");
  }

  return navigator.share({ files: [file] }).then(
    (): ShareOutcome => "shared",
    (err: unknown): ShareOutcome => {
      // DOMException isn't an Error subclass in every engine, so check the name directly.
      if ((err as { name?: unknown } | null)?.name === "AbortError") return "cancelled";
      onError?.(err);
      try {
        downloadFile(content, filename, "application/json");
      } catch (e) {
        onError?.(e);
      }
      return "downloaded";
    },
  );
}

/** Build the full-history export and share it. Call synchronously from a click handler. */
export function exportGymLog(onError?: (err: unknown) => void): Promise<ShareOutcome> {
  try {
    const now = new Date();
    const json = JSON.stringify(buildGymLogExport(now), null, 2);
    return shareOrDownloadFile(json, gymLogFilename(now), onError);
  } catch (err) {
    onError?.(err);
    return Promise.resolve("failed");
  }
}
