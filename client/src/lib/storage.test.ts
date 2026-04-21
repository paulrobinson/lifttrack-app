import { describe, it, expect, beforeEach } from "vitest";
import {
  initStorage,
  replaceExercises,
  getExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  saveExercisesOrder,
  getSessions,
  getActiveSession,
  startSession,
  endSession,
  getSessionSets,
  getAllSessionSets,
  logSet,
  logSetBulk,
  undoSet,
  archiveSession,
  unarchiveSession,
  deleteArchivedSession,
  getCategories,
  saveCategories,
  addCategory,
  deleteCategory,
  syncCategoriesFromExercises,
  getDaysSinceLastDone,
  getExerciseHistory,
  DEFAULT_CATEGORIES,
  type Exercise,
} from "./storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExercise(overrides: Partial<Omit<Exercise, "id">> = {}): Omit<Exercise, "id"> {
  return {
    name: "Test Curl",
    category: "Upper",
    weight: 20,
    maxReps: 12,
    sets: 3,
    lastReps: 8,
    sortOrder: 0,
    archived: false,
    ...overrides,
  };
}

// ─── initStorage ──────────────────────────────────────────────────────────────

describe("initStorage", () => {
  it("seeds 4 default exercises on first call", () => {
    initStorage();
    const exercises = getExercises();
    expect(exercises.length).toBe(4);
  });

  it("does not overwrite existing exercises when called again", () => {
    initStorage();
    const first = getExercises();
    createExercise(makeExercise({ name: "Extra" }));
    initStorage(); // second call — should be a no-op
    const second = getExercises();
    expect(second.length).toBe(first.length + 1);
  });
});

// ─── Exercise CRUD ────────────────────────────────────────────────────────────

describe("createExercise", () => {
  it("returns the created exercise with an auto-assigned id", () => {
    const ex = createExercise(makeExercise());
    expect(ex.id).toBeDefined();
    expect(typeof ex.id).toBe("number");
    expect(ex.name).toBe("Test Curl");
  });

  it("persists the exercise so getExercises includes it", () => {
    const ex = createExercise(makeExercise());
    const all = getExercises();
    expect(all.find((e) => e.id === ex.id)).toBeDefined();
  });

  it("assigns unique ids to multiple exercises", () => {
    const a = createExercise(makeExercise({ name: "A" }));
    const b = createExercise(makeExercise({ name: "B" }));
    expect(a.id).not.toBe(b.id);
  });
});

describe("getExercises", () => {
  it("returns an empty array when storage is clear", () => {
    expect(getExercises()).toEqual([]);
  });

  it("returns all created exercises", () => {
    createExercise(makeExercise({ name: "A" }));
    createExercise(makeExercise({ name: "B" }));
    expect(getExercises().length).toBe(2);
  });
});

describe("updateExercise", () => {
  it("updates only the specified fields", () => {
    const ex = createExercise(makeExercise());
    const updated = updateExercise(ex.id, { name: "Updated", weight: 30 });
    expect(updated.name).toBe("Updated");
    expect(updated.weight).toBe(30);
    expect(updated.maxReps).toBe(ex.maxReps); // unchanged
  });

  it("persists the change to localStorage", () => {
    const ex = createExercise(makeExercise());
    updateExercise(ex.id, { weight: 50 });
    const found = getExercises().find((e) => e.id === ex.id);
    expect(found?.weight).toBe(50);
  });
});

describe("deleteExercise", () => {
  it("removes an archived exercise", () => {
    const ex = createExercise(makeExercise({ archived: true }));
    deleteExercise(ex.id);
    expect(getExercises().find((e) => e.id === ex.id)).toBeUndefined();
  });

  it("throws when trying to delete a non-archived exercise", () => {
    const ex = createExercise(makeExercise({ archived: false }));
    expect(() => deleteExercise(ex.id)).toThrow();
  });
});

// ─── Archive ──────────────────────────────────────────────────────────────────

describe("archive / unarchive (via updateExercise)", () => {
  it("archives an exercise", () => {
    const ex = createExercise(makeExercise({ archived: false }));
    updateExercise(ex.id, { archived: true });
    const found = getExercises().find((e) => e.id === ex.id);
    expect(found?.archived).toBe(true);
  });

  it("unarchives an exercise", () => {
    const ex = createExercise(makeExercise({ archived: true }));
    updateExercise(ex.id, { archived: false });
    const found = getExercises().find((e) => e.id === ex.id);
    expect(found?.archived).toBe(false);
  });
});

// ─── replaceExercises ─────────────────────────────────────────────────────────

describe("replaceExercises", () => {
  it("replaces all exercises with the provided array and assigns new ids", () => {
    createExercise(makeExercise({ name: "Old" }));
    replaceExercises([makeExercise({ name: "New A" }), makeExercise({ name: "New B" })]);
    const exercises = getExercises();
    expect(exercises.length).toBe(2);
    expect(exercises[0].name).toBe("New A");
    expect(exercises[0].id).toBeDefined();
  });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

describe("startSession / getSessions / getActiveSession", () => {
  it("startSession creates a session with endedAt null", () => {
    const session = startSession();
    expect(session.endedAt).toBeNull();
    expect(session.startedAt).toBeTruthy();
  });

  it("getActiveSession returns the open session", () => {
    const session = startSession();
    expect(getActiveSession()?.id).toBe(session.id);
  });

  it("getActiveSession returns null when no session is active", () => {
    expect(getActiveSession()).toBeNull();
  });

  it("getSessions includes all created sessions", () => {
    startSession();
    startSession();
    expect(getSessions().length).toBe(2);
  });
});

describe("endSession", () => {
  it("sets endedAt to an ISO timestamp", () => {
    const session = startSession();
    const ended = endSession(session.id);
    expect(ended.endedAt).toBeTruthy();
    expect(() => new Date(ended.endedAt!)).not.toThrow();
  });

  it("getActiveSession returns null after ending the session", () => {
    const session = startSession();
    endSession(session.id);
    expect(getActiveSession()).toBeNull();
  });

  it("preserves previousWeight when weight was changed in the session being ended", () => {
    const ex = createExercise(makeExercise({ weight: 30 }));
    const session = startSession();
    // weight was changed in this session
    updateExercise(ex.id, { previousWeight: 28, weightChangedInSession: session.id });
    endSession(session.id);
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.previousWeight).toBe(28);
    expect(stored?.weightChangedInSession).toBe(session.id);
  });

  it("clears previousWeight when weight was changed in a prior session", () => {
    const ex = createExercise(makeExercise({ weight: 30 }));
    // weight was changed in a different session (id 99)
    updateExercise(ex.id, { previousWeight: 28, weightChangedInSession: 99 });
    const session = startSession();
    endSession(session.id);
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.previousWeight).toBeNull();
    expect(stored?.weightChangedInSession).toBeNull();
  });

  it("does not alter exercises without previousWeight on session end", () => {
    const ex = createExercise(makeExercise({ weight: 30 }));
    const session = startSession();
    endSession(session.id);
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.previousWeight).toBeUndefined();
  });
});

// ─── logSet ───────────────────────────────────────────────────────────────────

describe("logSet", () => {
  it("creates a SessionSet record with correct fields", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 8 }));
    const set = logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9 });
    expect(set.sessionId).toBe(session.id);
    expect(set.exerciseId).toBe(ex.id);
    expect(set.repsAchieved).toBe(9);
    expect(set.weight).toBe(20);
  });

  it("updates exercise.lastReps to the logged value", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 8 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastReps).toBe(10);
  });

  it("snapshots prevLastReps before mutating", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 7 }));
    const set = logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 11 });
    expect(set.prevLastReps).toBe(7);
  });

  it("getSessionSets returns the logged set for the correct session", () => {
    const session = startSession();
    const ex = createExercise(makeExercise());
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    const sets = getSessionSets(session.id);
    expect(sets.length).toBe(1);
    expect(sets[0].exerciseId).toBe(ex.id);
  });

  it("getSessionSets does not return sets from other sessions", () => {
    const s1 = startSession();
    const s2 = startSession();
    const ex = createExercise(makeExercise());
    logSet({ sessionId: s1.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    expect(getSessionSets(s2.id).length).toBe(0);
  });
});

// ─── logSet with setIndex ─────────────────────────────────────────────────────

describe("logSet with setIndex", () => {
  it("updates lastRepsSets[setIndex] to repsAchieved", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 8 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, setIndex: 1 });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastRepsSets?.[1]).toBe(9);
  });

  it("does not modify other indices of lastRepsSets", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 8, lastRepsSets: [8, 8, 8] }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 10, setIndex: 2 });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastRepsSets?.[0]).toBe(8);
    expect(updated?.lastRepsSets?.[1]).toBe(8);
    expect(updated?.lastRepsSets?.[2]).toBe(10);
  });

  it("seeds unlogged positions from exercise.lastReps when no prior lastRepsSets exists", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 8 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, setIndex: 0 });
    const updated = getExercises().find((e) => e.id === ex.id);
    // Unlogged positions get the pre-session lastReps value (8), not null,
    // so the reference bar in single mode always has valid data to min() over.
    expect(updated?.lastRepsSets).toEqual([9, 8, 8]);
  });

  it("still updates exercise.lastReps when setIndex is provided", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 8 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 11, setIndex: 0 });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastReps).toBe(11);
  });

  it("does not set lastRepsSets when setIndex is omitted", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 8 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastRepsSets).toBeUndefined();
  });

  it("does not set lastRepsSets for a single-set exercise", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 1, lastReps: 8 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 10, setIndex: 0 });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastRepsSets).toBeUndefined();
  });
});

// ─── logSetBulk ───────────────────────────────────────────────────────────────

describe("logSetBulk", () => {
  it("creates N SessionSet records", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 8 }));
    const sets = logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, numSets: 3 });
    expect(sets).toHaveLength(3);
    expect(getSessionSets(session.id)).toHaveLength(3);
  });

  it("each created record has the correct repsAchieved and weight", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 8 }));
    const sets = logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 25, repsAchieved: 7, numSets: 3 });
    expect(sets.every((s) => s.repsAchieved === 7)).toBe(true);
    expect(sets.every((s) => s.weight === 25)).toBe(true);
  });

  it("snapshots prevLastReps from exercise.lastReps before the call", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 5 }));
    const sets = logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8, numSets: 3 });
    expect(sets.every((s) => s.prevLastReps === 5)).toBe(true);
  });

  it("updates exercise.lastReps to repsAchieved", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 5 }));
    logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, numSets: 3 });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastReps).toBe(9);
  });

  it("updates exercise.lastRepsSets to an array of N identical values", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 5 }));
    logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, numSets: 3 });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastRepsSets).toEqual([9, 9, 9]);
  });

  it("does not set lastRepsSets when numSets is 1", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 1, lastReps: 5 }));
    logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, numSets: 1 });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastRepsSets).toBeUndefined();
  });

  it("returns an empty array when numSets is 0", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ sets: 3, lastReps: 5 }));
    const sets = logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, numSets: 0 });
    expect(sets).toHaveLength(0);
    expect(getSessionSets(session.id)).toHaveLength(0);
  });
});

// ─── undoSet ──────────────────────────────────────────────────────────────────

describe("undoSet", () => {
  it("removes the most recent set for the exercise", () => {
    const session = startSession();
    const ex = createExercise(makeExercise());
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    undoSet(session.id, ex.id);
    expect(getSessionSets(session.id).length).toBe(0);
  });

  it("restores exercise.lastReps to its pre-set value", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 7 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 12 });
    undoSet(session.id, ex.id);
    const restored = getExercises().find((e) => e.id === ex.id);
    expect(restored?.lastReps).toBe(7);
  });

  it("only removes the most recent set when multiple sets exist", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 5 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 6 });
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    undoSet(session.id, ex.id);
    expect(getSessionSets(session.id).length).toBe(1);
    expect(getSessionSets(session.id)[0].repsAchieved).toBe(6);
  });

  it("no-ops gracefully when no sets exist for the exercise", () => {
    const session = startSession();
    const ex = createExercise(makeExercise());
    expect(() => undoSet(session.id, ex.id)).not.toThrow();
  });
});

// ─── saveExercisesOrder ───────────────────────────────────────────────────────

describe("saveExercisesOrder", () => {
  it("assigns sortOrder values matching the position in the given id array", () => {
    const a = createExercise(makeExercise({ name: "A", sortOrder: 0 }));
    const b = createExercise(makeExercise({ name: "B", sortOrder: 1 }));
    const c = createExercise(makeExercise({ name: "C", sortOrder: 2 }));

    saveExercisesOrder([c.id, a.id, b.id]); // reverse C to front

    const all = getExercises();
    expect(all.find((e) => e.id === c.id)?.sortOrder).toBe(0);
    expect(all.find((e) => e.id === a.id)?.sortOrder).toBe(1);
    expect(all.find((e) => e.id === b.id)?.sortOrder).toBe(2);
  });

  it("persists the new sortOrder values to localStorage", () => {
    const a = createExercise(makeExercise({ name: "A", sortOrder: 0 }));
    const b = createExercise(makeExercise({ name: "B", sortOrder: 1 }));

    saveExercisesOrder([b.id, a.id]);

    const all = getExercises();
    expect(all.find((e) => e.id === b.id)?.sortOrder).toBe(0);
    expect(all.find((e) => e.id === a.id)?.sortOrder).toBe(1);
  });

  it("does not modify exercises whose id is absent from the array", () => {
    const a = createExercise(makeExercise({ name: "A", sortOrder: 0 }));
    const b = createExercise(makeExercise({ name: "B", sortOrder: 1 }));
    const c = createExercise(makeExercise({ name: "C", sortOrder: 99 }));

    saveExercisesOrder([a.id, b.id]); // c intentionally omitted

    expect(getExercises().find((e) => e.id === c.id)?.sortOrder).toBe(99);
  });

  it("a single-element array sets that exercise's sortOrder to 0", () => {
    const a = createExercise(makeExercise({ name: "A", sortOrder: 5 }));

    saveExercisesOrder([a.id]);

    expect(getExercises().find((e) => e.id === a.id)?.sortOrder).toBe(0);
  });
});

// ─── Categories ───────────────────────────────────────────────────────────────

describe("getCategories", () => {
  it("returns the default categories before initStorage is called", () => {
    const cats = getCategories();
    expect(cats).toEqual(DEFAULT_CATEGORIES);
  });

  it("returns the default categories after initStorage seeds them", () => {
    initStorage();
    const cats = getCategories();
    expect(cats).toEqual(DEFAULT_CATEGORIES);
  });

  it("does not overwrite saved categories on second initStorage call", () => {
    initStorage();
    addCategory("Cardio");
    initStorage(); // second call should be a no-op for categories
    const cats = getCategories();
    expect(cats).toContain("Cardio");
  });
});

describe("saveCategories", () => {
  it("persists a custom list and getCategories returns it", () => {
    saveCategories(["Yoga", "Pilates"]);
    expect(getCategories()).toEqual(["Yoga", "Pilates"]);
  });
});

describe("addCategory", () => {
  it("appends a new category and returns the updated list", () => {
    initStorage();
    const updated = addCategory("Cardio");
    expect(updated).toContain("Cardio");
    expect(getCategories()).toContain("Cardio");
  });

  it("does not add a duplicate (case-insensitive)", () => {
    initStorage();
    addCategory("Cardio");
    const result = addCategory("cardio");
    const count = result.filter((c) => c.toLowerCase() === "cardio").length;
    expect(count).toBe(1);
  });

  it("ignores whitespace-only names", () => {
    initStorage();
    const before = getCategories().length;
    addCategory("   ");
    expect(getCategories().length).toBe(before);
  });

  it("trims leading/trailing whitespace from the name", () => {
    initStorage();
    addCategory("  Stretching  ");
    expect(getCategories()).toContain("Stretching");
  });
});

describe("syncCategoriesFromExercises", () => {
  it("adds category names from exercises that are not already stored", () => {
    initStorage();
    syncCategoriesFromExercises([{ category: "Mobility" }]);
    expect(getCategories()).toContain("Mobility");
  });

  it("does not create duplicates for existing categories", () => {
    initStorage();
    const before = getCategories().length;
    syncCategoriesFromExercises([{ category: "Upper" }]);
    expect(getCategories().length).toBe(before);
  });
});

describe("deleteCategory", () => {
  it("removes the category from the stored list", () => {
    saveCategories(["Push", "Pull", "Legs"]);
    deleteCategory("Pull");
    expect(getCategories()).toEqual(["Push", "Legs"]);
  });

  it("returns the updated category list", () => {
    saveCategories(["Push", "Pull"]);
    const result = deleteCategory("Push");
    expect(result).toEqual(["Pull"]);
  });

  it("throws when the category has active exercises", () => {
    initStorage();
    addCategory("Cardio");
    createExercise(makeExercise({ category: "Cardio" }));
    expect(() => deleteCategory("Cardio")).toThrow();
    expect(getCategories()).toContain("Cardio");
  });

  it("allows deletion when exercises in that category are all archived", () => {
    initStorage();
    addCategory("Temp");
    const ex = createExercise(makeExercise({ category: "Temp" }));
    updateExercise(ex.id, { archived: true });
    expect(() => deleteCategory("Temp")).not.toThrow();
    expect(getCategories()).not.toContain("Temp");
  });

  it("is a no-op when the category does not exist", () => {
    saveCategories(["Push", "Pull"]);
    deleteCategory("Nonexistent");
    expect(getCategories()).toEqual(["Push", "Pull"]);
  });
});

describe("getAllSessionSets", () => {
  it("returns an empty array when no sets have been logged", () => {
    expect(getAllSessionSets()).toEqual([]);
  });

  it("returns sets from multiple sessions", () => {
    const ex1 = createExercise(makeExercise({ name: "Squat" }));
    const ex2 = createExercise(makeExercise({ name: "Press" }));
    const s1 = startSession();
    logSet({ sessionId: s1.id, exerciseId: ex1.id, weight: 60, repsAchieved: 8 });
    endSession(s1.id);
    const s2 = startSession();
    logSet({ sessionId: s2.id, exerciseId: ex2.id, weight: 40, repsAchieved: 10 });
    endSession(s2.id);
    const all = getAllSessionSets();
    expect(all.some((s) => s.sessionId === s1.id)).toBe(true);
    expect(all.some((s) => s.sessionId === s2.id)).toBe(true);
    expect(all).toHaveLength(2);
  });
});

describe("archiveSession / unarchiveSession", () => {
  it("marks a session as archived", () => {
    const session = startSession();
    endSession(session.id);
    archiveSession(session.id);
    const stored = getSessions().find((s) => s.id === session.id);
    expect(stored?.archived).toBe(true);
  });

  it("unarchive sets archived back to false", () => {
    const session = startSession();
    endSession(session.id);
    archiveSession(session.id);
    unarchiveSession(session.id);
    const stored = getSessions().find((s) => s.id === session.id);
    expect(stored?.archived).toBe(false);
  });

  it("leaves other sessions untouched", () => {
    const s1 = startSession();
    endSession(s1.id);
    const s2 = startSession();
    endSession(s2.id);
    archiveSession(s1.id);
    const s2Stored = getSessions().find((s) => s.id === s2.id);
    expect(s2Stored?.archived).toBeFalsy();
  });
});

describe("deleteArchivedSession", () => {
  it("removes the session record", () => {
    const session = startSession();
    endSession(session.id);
    archiveSession(session.id);
    deleteArchivedSession(session.id);
    expect(getSessions().find((s) => s.id === session.id)).toBeUndefined();
  });

  it("removes the session's sets", () => {
    const ex = createExercise(makeExercise());
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    endSession(session.id);
    archiveSession(session.id);
    deleteArchivedSession(session.id);
    expect(getAllSessionSets().filter((s) => s.sessionId === session.id)).toHaveLength(0);
  });

  it("does not remove sets from other sessions", () => {
    const ex = createExercise(makeExercise());
    const s1 = startSession();
    logSet({ sessionId: s1.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    endSession(s1.id);
    archiveSession(s1.id);
    const s2 = startSession();
    logSet({ sessionId: s2.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    endSession(s2.id);
    deleteArchivedSession(s1.id);
    expect(getAllSessionSets().filter((s) => s.sessionId === s2.id)).toHaveLength(1);
  });

  it("does not alter exercise lastReps", () => {
    const ex = createExercise(makeExercise({ lastReps: 8 }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 12 });
    endSession(session.id);
    archiveSession(session.id);
    deleteArchivedSession(session.id);
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.lastReps).toBe(12);
  });
});

describe("replaceExercises syncs categories", () => {
  it("adds any new category names found in the imported exercises", () => {
    initStorage();
    replaceExercises([
      makeExercise({ category: "Aquatics" }),
    ]);
    expect(getCategories()).toContain("Aquatics");
  });

  it("does not duplicate existing categories", () => {
    initStorage();
    replaceExercises([makeExercise({ category: "Upper" })]);
    const count = getCategories().filter((c) => c === "Upper").length;
    expect(count).toBe(1);
  });
});

describe("getDaysSinceLastDone", () => {
  it("returns null when the exercise has never been logged", () => {
    const ex = createExercise(makeExercise());
    expect(getDaysSinceLastDone(ex.id, null)).toBeNull();
  });

  it("returns null when only the current session has logged this exercise", () => {
    const ex = createExercise(makeExercise());
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    expect(getDaysSinceLastDone(ex.id, session.id)).toBeNull();
  });

  it("returns 0 when the exercise was done today in a previous session", () => {
    const ex = createExercise(makeExercise());
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    endSession(session.id);

    const currentSession = startSession();
    expect(getDaysSinceLastDone(ex.id, currentSession.id)).toBe(0);
  });

  it("calculates days since the most recent previous session", () => {
    const ex = createExercise(makeExercise());

    // Create an old session
    const oldSession = startSession();
    logSet({ sessionId: oldSession.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    endSession(oldSession.id);

    // Manually set the old session to 7 days ago
    const sessions = getSessions();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sessions.find((s) => s.id === oldSession.id)!.startedAt = sevenDaysAgo.toISOString();
    localStorage.setItem("lt_sessions", JSON.stringify(sessions));

    const currentSession = startSession();
    expect(getDaysSinceLastDone(ex.id, currentSession.id)).toBe(7);
  });

  it("ignores the current session when calculating days since last done", () => {
    const ex = createExercise(makeExercise());

    // Create an old session
    const oldSession = startSession();
    logSet({ sessionId: oldSession.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    endSession(oldSession.id);

    // Set old session to 5 days ago
    const sessions = getSessions();
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    sessions.find((s) => s.id === oldSession.id)!.startedAt = fiveDaysAgo.toISOString();
    localStorage.setItem("lt_sessions", JSON.stringify(sessions));

    // Current session with logged exercise should be ignored
    const currentSession = startSession();
    logSet({ sessionId: currentSession.id, exerciseId: ex.id, weight: 20, repsAchieved: 12 });

    expect(getDaysSinceLastDone(ex.id, currentSession.id)).toBe(5);
  });

  it("returns days from most recent session when multiple past sessions exist", () => {
    const ex = createExercise(makeExercise());

    // Create multiple past sessions
    const session1 = startSession();
    logSet({ sessionId: session1.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    endSession(session1.id);

    const session2 = startSession();
    logSet({ sessionId: session2.id, exerciseId: ex.id, weight: 20, repsAchieved: 11 });
    endSession(session2.id);

    // Set session1 to 10 days ago and session2 to 3 days ago
    const sessions = getSessions();
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    sessions.find((s) => s.id === session1.id)!.startedAt = tenDaysAgo.toISOString();
    sessions.find((s) => s.id === session2.id)!.startedAt = threeDaysAgo.toISOString();
    localStorage.setItem("lt_sessions", JSON.stringify(sessions));

    const currentSession = startSession();
    // Should return 3 (from the most recent session2, not 10 from session1)
    expect(getDaysSinceLastDone(ex.id, currentSession.id)).toBe(3);
  });
});

// ─── isFavourite ──────────────────────────────────────────────────────────────

describe("isFavourite field", () => {
  it("is not set (undefined) by default when creating an exercise", () => {
    const ex = createExercise(makeExercise());
    expect(ex.isFavourite).toBeUndefined();
  });

  it("can be set to true via updateExercise and persists in storage", () => {
    const ex = createExercise(makeExercise());
    updateExercise(ex.id, { isFavourite: true });
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.isFavourite).toBe(true);
  });

  it("can be toggled back to false via updateExercise", () => {
    const ex = createExercise(makeExercise());
    updateExercise(ex.id, { isFavourite: true });
    updateExercise(ex.id, { isFavourite: false });
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.isFavourite).toBe(false);
  });

  it("setting isFavourite does not alter other exercise fields", () => {
    const ex = createExercise(makeExercise({ name: "Curl", weight: 20, sets: 3 }));
    updateExercise(ex.id, { isFavourite: true });
    const stored = getExercises().find((e) => e.id === ex.id)!;
    expect(stored.name).toBe("Curl");
    expect(stored.weight).toBe(20);
    expect(stored.sets).toBe(3);
  });

  it("replaceExercises produces exercises without isFavourite set", () => {
    // Favourite an existing exercise, then replace the whole list
    const ex = createExercise(makeExercise());
    updateExercise(ex.id, { isFavourite: true });
    replaceExercises([makeExercise({ name: "Fresh" })]);
    const all = getExercises();
    expect(all).toHaveLength(1);
    expect(all[0].isFavourite).toBeFalsy();
  });
});

// ─── getExerciseHistory ───────────────────────────────────────────────────────

describe("getExerciseHistory", () => {
  it("returns an empty array when no sessions have been logged for the exercise", () => {
    const ex = createExercise(makeExercise());
    expect(getExerciseHistory(ex.id)).toEqual([]);
  });

  it("returns an empty array when the only session is still active (not ended)", () => {
    const ex = createExercise(makeExercise());
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    // do NOT call endSession — session is still active
    expect(getExerciseHistory(ex.id)).toHaveLength(0);
  });

  it("returns one entry per ended session that included the exercise", () => {
    const ex = createExercise(makeExercise());
    const s1 = startSession();
    logSet({ sessionId: s1.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    endSession(s1.id);
    const s2 = startSession();
    logSet({ sessionId: s2.id, exerciseId: ex.id, weight: 20, repsAchieved: 9 });
    endSession(s2.id);
    const history = getExerciseHistory(ex.id);
    expect(history).toHaveLength(2);
  });

  it("does not include sessions where a different exercise was logged", () => {
    const ex1 = createExercise(makeExercise({ name: "Squat" }));
    const ex2 = createExercise(makeExercise({ name: "Press" }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex2.id, weight: 40, repsAchieved: 10 });
    endSession(session.id);
    expect(getExerciseHistory(ex1.id)).toHaveLength(0);
  });

  it("sorts entries in chronological order (oldest first)", () => {
    const ex = createExercise(makeExercise());
    const s1 = startSession();
    logSet({ sessionId: s1.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    endSession(s1.id);
    const s2 = startSession();
    logSet({ sessionId: s2.id, exerciseId: ex.id, weight: 22.5, repsAchieved: 7 });
    endSession(s2.id);

    // Backdate s2 to be older than s1 so we can verify ordering is by date, not insertion order
    const sessions = getSessions();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    sessions.find((s) => s.id === s2.id)!.startedAt = yesterday.toISOString();
    localStorage.setItem("lt_sessions", JSON.stringify(sessions));

    const history = getExerciseHistory(ex.id);
    expect(history[0].sessionId).toBe(s2.id); // older session first
    expect(history[1].sessionId).toBe(s1.id);
  });

  it("captures the weight used in the session", () => {
    const ex = createExercise(makeExercise({ weight: 20 }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 25, repsAchieved: 8 });
    endSession(session.id);
    const history = getExerciseHistory(ex.id);
    expect(history[0].weight).toBe(25);
  });

  it("captures repsPerSet as an array of reps achieved per logged set", () => {
    const ex = createExercise(makeExercise({ sets: 3 }));
    const session = startSession();
    logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, numSets: 3 });
    endSession(session.id);
    const history = getExerciseHistory(ex.id);
    expect(history[0].repsPerSet).toHaveLength(3);
    expect(history[0].repsPerSet.every((r) => r === 9)).toBe(true);
  });

  it("computes totalReps as the sum of repsPerSet", () => {
    const ex = createExercise(makeExercise({ sets: 3 }));
    const session = startSession();
    logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, numSets: 3 });
    endSession(session.id);
    const history = getExerciseHistory(ex.id);
    expect(history[0].totalReps).toBe(27);
  });

  it("computes avgReps as totalReps divided by the number of sets", () => {
    const ex = createExercise(makeExercise({ sets: 3 }));
    const session = startSession();
    logSetBulk({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, numSets: 3 });
    endSession(session.id);
    const history = getExerciseHistory(ex.id);
    expect(history[0].avgReps).toBe(9);
  });
});
