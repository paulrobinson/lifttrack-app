import { describe, it, expect, afterEach, vi } from "vitest";
import {
  createExercise,
  startSession,
  endSession,
  logSet,
  logSetBulk,
  archiveSession,
  getAllSessionSets,
  getSessions,
  migrateStorage,
  initStorage,
  saveSettings,
  toIsoWithOffset,
  DEFAULT_SETTINGS,
  type Exercise,
} from "./storage";
import {
  buildGymLogExport,
  gymLogFilename,
  shareOrDownloadFile,
  exportGymLog,
} from "./gymLogExport";

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

function makeExercise(overrides: Partial<Omit<Exercise, "id">> = {}): Omit<Exercise, "id"> {
  return {
    name: "Bench Press",
    category: "Chest",
    weight: 60,
    maxReps: 12,
    sets: 3,
    lastReps: 8,
    sortOrder: 0,
    archived: false,
    ...overrides,
  };
}

function stubShare(share: (data: ShareData) => Promise<void>, canShare: (data: ShareData) => boolean) {
  Object.defineProperty(navigator, "share", { value: vi.fn(share), configurable: true, writable: true });
  Object.defineProperty(navigator, "canShare", { value: vi.fn(canShare), configurable: true, writable: true });
  return {
    share: navigator.share as unknown as ReturnType<typeof vi.fn>,
    canShare: navigator.canShare as unknown as ReturnType<typeof vi.fn>,
  };
}

afterEach(() => {
  // @ts-expect-error — remove test stubs
  delete navigator.share;
  // @ts-expect-error — remove test stubs
  delete navigator.canShare;
  vi.restoreAllMocks();
});

// ─── Timestamps & filename ────────────────────────────────────────────────────

describe("toIsoWithOffset", () => {
  it("formats with an explicit offset and represents the same instant", () => {
    const d = new Date("2026-10-14T16:05:09.000Z");
    const iso = toIsoWithOffset(d);
    expect(iso).toMatch(ISO_WITH_OFFSET);
    expect(new Date(iso).getTime()).toBe(d.getTime());
  });
});

describe("gymLogFilename", () => {
  it("uses zero-padded local time", () => {
    expect(gymLogFilename(new Date(2026, 0, 5, 7, 8, 9))).toBe("gym-log-20260105-070809.json");
  });

  it("sorts lexically in time order", () => {
    const a = gymLogFilename(new Date(2026, 8, 30, 23, 59, 59));
    const b = gymLogFilename(new Date(2026, 9, 1, 0, 0, 0));
    expect([b, a].sort()).toEqual([a, b]);
  });
});

// ─── Per-set logging ──────────────────────────────────────────────────────────

describe("per-set timestamps", () => {
  it("logSet records t with offset", () => {
    const ex = createExercise(makeExercise());
    const s = startSession();
    const set = logSet({ sessionId: s.id, exerciseId: ex.id, weight: 60, repsAchieved: 8, setIndex: 0 });
    expect(set.t).toMatch(ISO_WITH_OFFSET);
    expect(getAllSessionSets()[0].t).toBe(set.t);
  });

  it("logSetBulk records t on every set", () => {
    const ex = createExercise(makeExercise());
    const s = startSession();
    logSetBulk({ sessionId: s.id, exerciseId: ex.id, weight: 60, repsAchieved: 8, numSets: 3 });
    const sets = getAllSessionSets();
    expect(sets).toHaveLength(3);
    sets.forEach((set) => expect(set.t).toMatch(ISO_WITH_OFFSET));
  });
});

// ─── Migration ────────────────────────────────────────────────────────────────

describe("migrateStorage", () => {
  const oldSessions = [
    { id: 10, startedAt: "2026-03-01T09:00:00.000Z", endedAt: "2026-03-01T10:00:00.000Z" },
    { id: 11, startedAt: "2026-03-03T09:00:00.000Z", endedAt: "2026-03-03T10:00:00.000Z", archived: true },
  ];
  const oldSets = [
    { id: 20, sessionId: 10, exerciseId: 1, weight: 60, repsAchieved: 8, prevLastReps: 7 },
    { id: 21, sessionId: 11, exerciseId: 1, weight: 62.5, repsAchieved: 6, prevLastReps: 8 },
  ];

  function seedOld() {
    localStorage.setItem("lt_sessions", JSON.stringify(oldSessions));
    localStorage.setItem("lt_session_sets", JSON.stringify(oldSets));
  }

  it("turns each old entry into a set with t = null without losing data", () => {
    seedOld();
    migrateStorage();
    expect(getAllSessionSets()).toEqual(oldSets.map((s) => ({ ...s, t: null })));
  });

  it("marks sessions with old entries as legacy and keeps their other fields", () => {
    seedOld();
    migrateStorage();
    expect(getSessions()).toEqual(oldSessions.map((s) => ({ ...s, legacy: true })));
  });

  it("runs from initStorage and is idempotent", () => {
    seedOld();
    initStorage();
    const after1 = localStorage.getItem("lt_session_sets");
    initStorage();
    expect(localStorage.getItem("lt_session_sets")).toBe(after1);
  });

  it("does not mark new sessions as legacy", () => {
    seedOld();
    migrateStorage();
    const ex = createExercise(makeExercise());
    const s = startSession();
    logSet({ sessionId: s.id, exerciseId: ex.id, weight: 60, repsAchieved: 8 });
    migrateStorage();
    expect(getSessions().find((x) => x.id === s.id)?.legacy).toBeUndefined();
  });
});

// ─── Export builder ───────────────────────────────────────────────────────────

describe("buildGymLogExport", () => {
  it("produces the schema-1 shape with every set", () => {
    const bench = createExercise(makeExercise({ name: "Bench Press", category: "Chest" }));
    const fly = createExercise(makeExercise({ name: "Dumbbell Fly", category: "Chest", weight: 12 }));
    const s = startSession();
    logSet({ sessionId: s.id, exerciseId: bench.id, weight: 60, repsAchieved: 10, setIndex: 0 });
    logSet({ sessionId: s.id, exerciseId: bench.id, weight: 60, repsAchieved: 9, setIndex: 1 });
    logSet({ sessionId: s.id, exerciseId: bench.id, weight: 60, repsAchieved: 7, setIndex: 2 });
    logSet({ sessionId: s.id, exerciseId: fly.id, weight: 12, repsAchieved: 12 });
    endSession(s.id);

    const out = buildGymLogExport(new Date());
    expect(out.schema).toBe(1);
    expect(out.exportedAt).toMatch(ISO_WITH_OFFSET);
    expect(out.sessionCount).toBe(1);
    const [sess] = out.sessions;
    expect(typeof sess.id).toBe("string");
    expect(sess.start).toMatch(ISO_WITH_OFFSET);
    expect(sess.end).toMatch(ISO_WITH_OFFSET);
    expect(sess.category).toBe("All Chest");
    expect(sess.legacy).toBe(false);
    expect(sess.exercises.map((e) => e.name)).toEqual(["Bench Press", "Dumbbell Fly"]);
    expect(sess.exercises[0].sets.map(({ kg, reps }) => ({ kg, reps }))).toEqual([
      { kg: 60, reps: 10 }, { kg: 60, reps: 9 }, { kg: 60, reps: 7 },
    ]);
    sess.exercises.flatMap((e) => e.sets).forEach((set) => expect(set.t).toMatch(ISO_WITH_OFFSET));
    expect(Object.keys(sess).sort()).toEqual(["category", "end", "exercises", "id", "legacy", "start"]);
  });

  it("sorts sessions oldest first and includes archived ones, skipping empty sessions", () => {
    localStorage.setItem("lt_sessions", JSON.stringify([
      { id: 3, startedAt: "2026-05-03T09:00:00.000Z", endedAt: "2026-05-03T10:00:00.000Z" },
      { id: 1, startedAt: "2026-05-01T09:00:00.000Z", endedAt: "2026-05-01T10:00:00.000Z", archived: true },
      { id: 2, startedAt: "2026-05-02T09:00:00.000Z", endedAt: "2026-05-02T10:00:00.000Z" },
    ]));
    localStorage.setItem("lt_session_sets", JSON.stringify([
      { id: 30, sessionId: 3, exerciseId: 99, weight: 0, repsAchieved: 10, prevLastReps: null, t: null },
      { id: 31, sessionId: 1, exerciseId: 99, weight: 0, repsAchieved: 9, prevLastReps: null, t: null },
    ]));
    archiveSession(1);
    const out = buildGymLogExport();
    expect(out.sessionCount).toBe(2);
    expect(out.sessions.map((s) => s.id.split("-")[0])).toEqual(["1", "3"]);
    expect(out.sessions[0].exercises[0].sets[0]).toEqual({ kg: 0, reps: 9, t: null });
  });

  it("exports legacy sessions with legacy: true and t: null", () => {
    localStorage.setItem("lt_sessions", JSON.stringify([
      { id: 1, startedAt: "2026-05-01T09:00:00.000Z", endedAt: "2026-05-01T10:00:00.000Z" },
    ]));
    localStorage.setItem("lt_session_sets", JSON.stringify([
      { id: 2, sessionId: 1, exerciseId: 5, weight: 20, repsAchieved: 8, prevLastReps: 7 },
    ]));
    migrateStorage();
    const [sess] = buildGymLogExport().sessions;
    expect(sess.legacy).toBe(true);
    expect(sess.exercises[0].sets).toEqual([{ kg: 20, reps: 8, t: null }]);
  });

  it("includes an in-progress session with end: null", () => {
    const ex = createExercise(makeExercise());
    const s = startSession();
    logSet({ sessionId: s.id, exerciseId: ex.id, weight: 60, repsAchieved: 8 });
    expect(buildGymLogExport().sessions[0].end).toBeNull();
  });

  it("uses Mixed when no category dominates", () => {
    const a = createExercise(makeExercise({ name: "A", category: "Chest" }));
    const b = createExercise(makeExercise({ name: "B", category: "Back" }));
    const s = startSession();
    logSet({ sessionId: s.id, exerciseId: a.id, weight: 10, repsAchieved: 8 });
    logSet({ sessionId: s.id, exerciseId: b.id, weight: 10, repsAchieved: 8 });
    endSession(s.id);
    expect(buildGymLogExport().sessions[0].category).toBe("Mixed");
  });

  it("converts to kg when the app is set to lbs", () => {
    saveSettings({ ...DEFAULT_SETTINGS, weightUnit: "lbs" });
    const ex = createExercise(makeExercise({ weight: 100 }));
    const s = startSession();
    logSet({ sessionId: s.id, exerciseId: ex.id, weight: 100, repsAchieved: 8 });
    expect(buildGymLogExport().sessions[0].exercises[0].sets[0].kg).toBe(45.36);
  });

  it("contains no display markers", () => {
    const ex = createExercise(makeExercise());
    const s1 = startSession();
    logSet({ sessionId: s1.id, exerciseId: ex.id, weight: 60, repsAchieved: 8 });
    endSession(s1.id);
    const s2 = startSession();
    logSet({ sessionId: s2.id, exerciseId: ex.id, weight: 65, repsAchieved: 10 });
    endSession(s2.id);
    const json = JSON.stringify(buildGymLogExport());
    expect(json).not.toMatch(/[↑↓]|\(↑wt\)/);
  });
});

// ─── Share / download ─────────────────────────────────────────────────────────

describe("shareOrDownloadFile", () => {
  it("shares an application/json file synchronously when supported", async () => {
    const { share } = stubShare(() => Promise.resolve(), () => true);
    const p = shareOrDownloadFile("{}", "gym-log-20260101-000000.json");
    expect(share).toHaveBeenCalledTimes(1); // called before any await
    const file = share.mock.calls[0][0].files[0] as File;
    expect(file.name).toBe("gym-log-20260101-000000.json");
    expect(file.type).toBe("application/json");
    await expect(p).resolves.toBe("shared");
  });

  it("retries as text/plain keeping the .json name when JSON isn't shareable", async () => {
    const { share } = stubShare(
      () => Promise.resolve(),
      (data) => data.files![0].type === "text/plain",
    );
    await shareOrDownloadFile("{}", "x.json");
    const file = share.mock.calls[0][0].files[0] as File;
    expect(file.type).toBe("text/plain");
    expect(file.name).toBe("x.json");
  });

  it("falls back to a download when sharing isn't supported", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await expect(shareOrDownloadFile("{}", "x.json")).resolves.toBe("downloaded");
    expect(createUrl).toHaveBeenCalled();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe("x.json");
  });

  it("treats AbortError as a normal cancel without reporting an error", async () => {
    stubShare(() => Promise.reject(new DOMException("cancelled", "AbortError")), () => true);
    const onError = vi.fn();
    await expect(shareOrDownloadFile("{}", "x.json", onError)).resolves.toBe("cancelled");
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports other share errors and falls back to a download", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    stubShare(() => Promise.reject(new DOMException("nope", "NotAllowedError")), () => true);
    const onError = vi.fn();
    await expect(shareOrDownloadFile("{}", "x.json", onError)).resolves.toBe("downloaded");
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("exportGymLog", () => {
  it("shares the full history as gym-log-*.json", async () => {
    const ex = createExercise(makeExercise());
    const s = startSession();
    logSet({ sessionId: s.id, exerciseId: ex.id, weight: 60, repsAchieved: 8 });
    endSession(s.id);
    const { share } = stubShare(() => Promise.resolve(), () => true);
    const p = exportGymLog();
    expect(share).toHaveBeenCalledTimes(1);
    const file = share.mock.calls[0][0].files[0] as File;
    expect(file.name).toMatch(/^gym-log-\d{8}-\d{6}\.json$/);
    const parsed = JSON.parse(await file.text());
    expect(parsed.sessionCount).toBe(1);
    expect(parsed.sessions[0].exercises[0].sets[0]).toMatchObject({ kg: 60, reps: 8 });
    await p;
  });
});
