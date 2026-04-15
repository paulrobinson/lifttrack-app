// ─── localStorage persistence layer ─────────────────────────────────────────
// Replaces the SQLite/Express backend. All data lives in the browser.

export interface Exercise {
  id: number;
  name: string;
  category: string;
  weight: number;
  maxReps: number;
  sets: number;
  lastReps: number | null;
  lastRepsSets?: number[] | null; // per-set rep data (e.g. from "Reps: 10, 10, 10, 9" import)
  tempo?: string;
  lastTrend?: "up" | "down" | null;
  sortOrder: number;
  archived: boolean;
  isFavourite?: boolean;
}

export interface Settings {
  showSeparateBars: boolean;
}

export const DEFAULT_SETTINGS: Settings = { showSeparateBars: false };

export interface Session {
  id: number;
  startedAt: string;
  endedAt: string | null;
  archived?: boolean;
}

export interface SessionSet {
  id: number;
  sessionId: number;
  exerciseId: number;
  weight: number;
  repsAchieved: number;
  prevLastReps: number | null;
}

// ─── Keys ────────────────────────────────────────────────────────────────────

// In preview builds the workflow sets VITE_STORAGE_PREFIX (e.g. "preview_pr42_")
// so preview data is kept separate from production data in localStorage.
const _prefix = (import.meta.env.VITE_STORAGE_PREFIX as string | undefined) ?? "";

const KEYS = {
  exercises:   `${_prefix}lt_exercises`,
  sessions:    `${_prefix}lt_sessions`,
  sessionSets: `${_prefix}lt_session_sets`,
  nextId:      `${_prefix}lt_next_id`,
  categories:  `${_prefix}lt_categories`,
  settings:    `${_prefix}lt_settings`,
} as const;

export const DEFAULT_CATEGORIES = ["Back", "Chest", "Upper", "Legs"];

// ─── ID generator ────────────────────────────────────────────────────────────

function nextId(): number {
  const val = parseInt(localStorage.getItem(KEYS.nextId) ?? "1", 10);
  localStorage.setItem(KEYS.nextId, String(val + 1));
  return val;
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

function load<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Seed data (first run only) ──────────────────────────────────────────────

function buildSeeds(): Exercise[] {
  let order = 0;
  const ex = (name: string, category: string, weight: number, maxReps: number, sets: number, lastReps: number): Exercise => ({
    id: nextId(),
    name, category, weight, maxReps, sets,
    lastReps,
    sortOrder: order++,
    archived: false,
  });

  return [
    // ── Upper ──
    ex("DB Row (Chest Supported)", "Upper", 28, 12, 3, 8),
    ex("Unilateral Cable Row",     "Upper", 50, 12, 3, 8),
    ex("Standing Cable Flys",      "Upper", 18, 12, 5, 8),
    ex("Cable Pushdown",           "Upper", 32, 15, 3, 8),
    ex("Chin-ups",                 "Upper",  0, 15, 2, 7),
    ex("BB Curls",                 "Upper", 20, 12, 2, 8),
    ex("DB Shrugs",                "Upper", 24, 12, 3, 8),

    // ── Chest ──
    ex("Pec Deck",            "Chest", 86, 12, 4, 9),
    ex("DB Flys",             "Chest", 12, 15, 3, 12),
    ex("DB Press",            "Chest", 22,  8, 3, 8),
    ex("DB Shoulder Press",   "Chest", 16, 12, 3, 8),
    ex("DB Lateral Raises",   "Chest",  4, 20, 3, 8),
    ex("Roll Outs",           "Chest",  0, 15, 3, 8),

    // ── Back ──
    ex("Pull Ups",                  "Back",  0, 12, 3, 6),
    ex("DB Rows",                   "Back", 30,  8, 3, 8),
    ex("Cable Row",                 "Back", 59, 12, 3, 8),
    ex("Close Grip Lat Pull-down",  "Back", 45, 15, 2, 8),
    ex("Rear Delt Fly",             "Back", 45, 20, 3, 15),
    ex("Face Pulls",                "Back", 36, 15, 3, 8),

    // ── Legs ──
    ex("BB RDL",                "Legs", 60,  8, 3, 8),
    ex("Front Squat",           "Legs", 60,  8, 3, 6),
    ex("Back Squat",            "Legs", 60,  8, 3, 6),
    ex("BB Bulgarian Squats",   "Legs", 30,  8, 3, 8),
    ex("Unilateral Leg Curl",   "Legs", 14,  8, 3, 7),
    ex("Ab Crunch Machine",     "Legs", 38, 12, 3, 10),
  ];
}

export function initStorage(): void {
  if (!localStorage.getItem(KEYS.exercises)) {
    save(KEYS.exercises, buildSeeds());
  }
  if (!localStorage.getItem(KEYS.categories)) {
    localStorage.setItem(KEYS.categories, JSON.stringify(DEFAULT_CATEGORIES));
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function getCategories(): string[] {
  try {
    const stored = localStorage.getItem(KEYS.categories);
    if (!stored) return [...DEFAULT_CATEGORIES];
    return JSON.parse(stored) as string[];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

export function saveCategories(categories: string[]): void {
  localStorage.setItem(KEYS.categories, JSON.stringify(categories));
}

export function addCategory(name: string): string[] {
  const trimmed = name.trim();
  const categories = getCategories();
  if (!trimmed || categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return categories;
  }
  const updated = [...categories, trimmed];
  saveCategories(updated);
  return updated;
}

export function deleteCategory(name: string): string[] {
  const exercises = getExercises();
  const hasExercises = exercises.some((e) => e.category === name && !e.archived);
  if (hasExercises) throw new Error("Cannot remove a group that still has exercises.");
  const updated = getCategories().filter((c) => c !== name);
  saveCategories(updated);
  return updated;
}

/** Merge any category names found in exercises into the stored categories list. */
export function syncCategoriesFromExercises(exercises: { category: string }[]): void {
  const current = getCategories();
  const incoming = exercises.map((e) => e.category).filter(Boolean);
  const newCats = incoming.filter(
    (c) => !current.some((existing) => existing.toLowerCase() === c.toLowerCase())
  );
  if (newCats.length > 0) {
    saveCategories([...current, ...newCats]);
  }
}

export function replaceExercises(exercises: Omit<Exercise, "id">[]): void {
  localStorage.removeItem(KEYS.exercises);
  const withIds = exercises.map((ex) => ({ ...ex, id: nextId() }));
  save(KEYS.exercises, withIds);
  syncCategoriesFromExercises(exercises);
}

// ─── Exercises ───────────────────────────────────────────────────────────────

export function getExercises(): Exercise[] {
  return load<Exercise>(KEYS.exercises);
}

export function createExercise(data: Omit<Exercise, "id">): Exercise {
  const exercises = getExercises();
  const ex: Exercise = { ...data, id: nextId() };
  save(KEYS.exercises, [...exercises, ex]);
  return ex;
}

export function updateExercise(id: number, data: Partial<Exercise>): Exercise {
  const exercises = getExercises();
  const updated = exercises.map((ex) => ex.id === id ? { ...ex, ...data } : ex);
  save(KEYS.exercises, updated);
  return updated.find((ex) => ex.id === id)!;
}

export function saveExercisesOrder(orderedIds: number[]): void {
  const exercises = getExercises();
  const updated = exercises.map((ex) => {
    const newOrder = orderedIds.indexOf(ex.id);
    return newOrder !== -1 ? { ...ex, sortOrder: newOrder } : ex;
  });
  save(KEYS.exercises, updated);
}

export function deleteExercise(id: number): void {
  const exercises = getExercises();
  // Only allow deleting archived exercises
  const ex = exercises.find((e) => e.id === id);
  if (!ex?.archived) throw new Error("Exercise must be archived before deleting");
  save(KEYS.exercises, exercises.filter((e) => e.id !== id));
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function getSessions(): Session[] {
  return load<Session>(KEYS.sessions);
}

export function getActiveSession(): Session | null {
  return getSessions().find((s) => s.endedAt === null) ?? null;
}

export function startSession(): Session {
  const session: Session = {
    id: nextId(),
    startedAt: new Date().toISOString(),
    endedAt: null,
  };
  save(KEYS.sessions, [...getSessions(), session]);
  return session;
}

export function endSession(id: number): Session {
  const sessions = getSessions();
  const updated = sessions.map((s) =>
    s.id === id ? { ...s, endedAt: new Date().toISOString() } : s
  );
  save(KEYS.sessions, updated);
  return updated.find((s) => s.id === id)!;
}

// ─── Session Sets ─────────────────────────────────────────────────────────────

export function getSessionSets(sessionId: number): SessionSet[] {
  return load<SessionSet>(KEYS.sessionSets).filter((s) => s.sessionId === sessionId);
}

export function getAllSessionSets(): SessionSet[] {
  return load<SessionSet>(KEYS.sessionSets);
}

export function archiveSession(id: number): void {
  const sessions = getSessions();
  save(KEYS.sessions, sessions.map((s) => s.id === id ? { ...s, archived: true } : s));
}

export function unarchiveSession(id: number): void {
  const sessions = getSessions();
  save(KEYS.sessions, sessions.map((s) => s.id === id ? { ...s, archived: false } : s));
}

/** Remove a session and its sets from storage without touching any exercise data. */
export function deleteArchivedSession(id: number): void {
  save(KEYS.sessions, getSessions().filter((s) => s.id !== id));
  save(KEYS.sessionSets, load<SessionSet>(KEYS.sessionSets).filter((s) => s.sessionId !== id));
}

export function logSet(params: {
  sessionId: number;
  exerciseId: number;
  weight: number;
  repsAchieved: number;
  setIndex?: number;
}): SessionSet {
  const { setIndex, ...setParams } = params;
  const exercises = getExercises();
  const ex = exercises.find((e) => e.id === params.exerciseId)!;

  const set: SessionSet = {
    id: nextId(),
    ...setParams,
    prevLastReps: ex.lastReps,
  };

  const updates: Partial<Exercise> = { lastReps: params.repsAchieved };
  if (setIndex !== undefined && ex.sets > 1) {
    const prev = ex.lastRepsSets && ex.lastRepsSets.length === ex.sets
      ? [...ex.lastRepsSets]
      : Array(ex.sets).fill(ex.lastReps); // seed unlogged positions with pre-session value
    prev[setIndex] = params.repsAchieved;
    updates.lastRepsSets = prev;
  }
  updateExercise(params.exerciseId, updates);

  const sets = load<SessionSet>(KEYS.sessionSets);
  save(KEYS.sessionSets, [...sets, set]);
  return set;
}

/**
 * Log N identical sets in one call (single-bar mode).
 * Creates one SessionSet per set index and updates both exercise.lastReps
 * and exercise.lastRepsSets atomically.
 */
export function logSetBulk(params: {
  sessionId: number;
  exerciseId: number;
  weight: number;
  repsAchieved: number;
  numSets: number;
}): SessionSet[] {
  const exercises = getExercises();
  const ex = exercises.find((e) => e.id === params.exerciseId)!;
  const prevLastReps = ex.lastReps;

  const newSets: SessionSet[] = [];
  const allSets = load<SessionSet>(KEYS.sessionSets);

  for (let i = 0; i < params.numSets; i++) {
    const set: SessionSet = {
      id: nextId(),
      sessionId: params.sessionId,
      exerciseId: params.exerciseId,
      weight: params.weight,
      repsAchieved: params.repsAchieved,
      prevLastReps,
    };
    newSets.push(set);
    allSets.push(set);
  }

  save(KEYS.sessionSets, allSets);

  const updates: Partial<Exercise> = { lastReps: params.repsAchieved };
  if (params.numSets > 1) {
    updates.lastRepsSets = Array(params.numSets).fill(params.repsAchieved);
  }
  updateExercise(params.exerciseId, updates);

  return newSets;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSettings(): Settings {
  try {
    const stored = localStorage.getItem(KEYS.settings);
    if (!stored) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } as Settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

/** Remove a specific SessionSet by ID without touching exercise.lastReps. */
export function deleteSessionSetById(id: number): void {
  const sets = load<SessionSet>(KEYS.sessionSets);
  save(KEYS.sessionSets, sets.filter((s) => s.id !== id));
}

export function undoSet(sessionId: number, exerciseId: number): void {
  const sets = load<SessionSet>(KEYS.sessionSets);
  // Find the most recent set for this exercise in this session
  const idx = [...sets].reverse().findIndex(
    (s) => s.sessionId === sessionId && s.exerciseId === exerciseId
  );
  if (idx === -1) return;
  const realIdx = sets.length - 1 - idx;
  const set = sets[realIdx];

  // Restore exercise to its pre-set state
  updateExercise(exerciseId, { lastReps: set.prevLastReps });

  save(KEYS.sessionSets, sets.filter((_, i) => i !== realIdx));
}

/**
 * Get the number of days since an exercise was last done.
 * Returns null if the exercise has never been done.
 */
export function getDaysSinceLastDone(exerciseId: number, currentSessionId: number | null): number | null {
  const allSets = getAllSessionSets();
  const allSessions = getSessions();

  // Find all sets for this exercise, excluding the current session
  const exerciseSets = allSets.filter(
    (set) => set.exerciseId === exerciseId && set.sessionId !== currentSessionId
  );

  if (exerciseSets.length === 0) return null;

  // Get unique session IDs and find the most recent one
  const sessionIds = [...new Set(exerciseSets.map((set) => set.sessionId))];
  const exerciseSessions = allSessions.filter((s) => sessionIds.includes(s.id));

  if (exerciseSessions.length === 0) return null;

  // Find the most recent session
  const mostRecentSession = exerciseSessions.reduce((latest, current) => {
    const latestDate = new Date(latest.startedAt);
    const currentDate = new Date(current.startedAt);
    return currentDate > latestDate ? current : latest;
  });

  // Calculate days since
  const lastDate = new Date(mostRecentSession.startedAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - lastDate.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}
