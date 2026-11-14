// ─── Coach notes ─────────────────────────────────────────────────────────────
//
// Read-only advice for today's session, published nightly as a static JSON file
// on the `coach-notes` branch. Everything here fails silently: any problem
// (network, 404, bad JSON, unknown schema, wrong date) simply means "no notes".
// Notes are never written into session logs or exports — the only thing
// persisted is a copy of the last good response, under its own localStorage key.

export const COACH_NOTES_URL =
  "https://raw.githubusercontent.com/paulrobinson/lifttrack-app/coach-notes/coach-notes.json";

const _prefix = (import.meta.env.VITE_STORAGE_PREFIX as string | undefined) ?? "";
export const COACH_NOTES_CACHE_KEY = `${_prefix}lt_coach_notes_cache`;

const FETCH_TIMEOUT_MS = 10_000;

export interface CoachExerciseNote {
  target: string;
  note: string;
}

export interface CoachNotes {
  schema: 1;
  date: string; // YYYY-MM-DD, Europe/London
  generatedAt?: string;
  session: { focus: string; note: string } | null;
  exercises: Record<string, CoachExerciseNote>;
}

/** Today's date (YYYY-MM-DD) in Europe/London. */
export function londonDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Normalise an exercise name for matching: trimmed, case-insensitive, single spaces. */
export function normaliseExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Validate an unknown JSON value against schema 1. Returns null for anything
 * that isn't a recognisable schema-1 document. Individual malformed exercise
 * entries are dropped rather than rejecting the whole file.
 */
export function parseCoachNotes(data: unknown): CoachNotes | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (d.schema !== 1) return null;
  if (typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return null;

  let session: CoachNotes["session"] = null;
  if (d.session && typeof d.session === "object" && !Array.isArray(d.session)) {
    const s = d.session as Record<string, unknown>;
    const focus = str(s.focus);
    const note = str(s.note);
    if (focus || note) session = { focus, note };
  }

  const exercises: Record<string, CoachExerciseNote> = {};
  if (d.exercises && typeof d.exercises === "object" && !Array.isArray(d.exercises)) {
    for (const [name, value] of Object.entries(d.exercises as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const v = value as Record<string, unknown>;
      const target = str(v.target);
      const note = str(v.note);
      const key = normaliseExerciseName(name);
      if (key && (target || note)) exercises[key] = { target, note };
    }
  }

  return {
    schema: 1,
    date: d.date,
    ...(typeof d.generatedAt === "string" ? { generatedAt: d.generatedAt } : {}),
    session,
    exercises,
  };
}

/** True when the notes are for today's date in Europe/London. */
export function isForToday(notes: CoachNotes | null | undefined, now: Date = new Date()): notes is CoachNotes {
  return !!notes && notes.date === londonDate(now);
}

/** Look up the note for an exercise by name (case-insensitive, trimmed). */
export function findExerciseNote(notes: CoachNotes | null | undefined, exerciseName: string): CoachExerciseNote | null {
  if (!notes) return null;
  return notes.exercises[normaliseExerciseName(exerciseName)] ?? null;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export function readCachedCoachNotes(): CoachNotes | null {
  try {
    const raw = localStorage.getItem(COACH_NOTES_CACHE_KEY);
    return raw ? parseCoachNotes(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCachedCoachNotes(notes: CoachNotes): void {
  try {
    localStorage.setItem(COACH_NOTES_CACHE_KEY, JSON.stringify(notes));
  } catch {
    // Storage full / blocked — not important.
  }
}

/** Cached notes, but only if they are for today. */
export function loadCachedCoachNotesForToday(now: Date = new Date()): CoachNotes | null {
  const cached = readCachedCoachNotes();
  return isForToday(cached, now) ? cached : null;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

/** URL with a per-minute cache-busting param so a stale browser cache can't hide new notes. */
export function coachNotesUrl(now: Date = new Date()): string {
  return `${COACH_NOTES_URL}?t=${Math.floor(now.getTime() / 60_000)}`;
}

/**
 * Fetch the latest notes. Resolves to the parsed notes (whatever their date) or
 * null on any failure; never rejects. A valid response is cached, unless the
 * cache already holds notes for a later date (e.g. a CDN serving a stale copy).
 */
export async function fetchCoachNotes(
  fetchImpl: typeof fetch = globalThis.fetch,
  now: Date = new Date(),
): Promise<CoachNotes | null> {
  if (typeof fetchImpl !== "function") return null;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(coachNotesUrl(now), {
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) {
      console.warn(`Coach notes: HTTP ${res.status}`);
      return null;
    }
    const notes = parseCoachNotes(await res.json());
    if (!notes) {
      console.warn("Coach notes: unrecognised format");
      return null;
    }
    const cached = readCachedCoachNotes();
    if (!cached || notes.date >= cached.date) writeCachedCoachNotes(notes);
    return notes;
  } catch (err) {
    console.warn("Coach notes: fetch failed", err);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
