import { describe, it, expect, beforeEach } from "vitest";
import {
  initStorage,
  resetExercises,
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
  logSet,
  undoSet,
  getCategories,
  saveCategories,
  addCategory,
  syncCategoriesFromExercises,
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
    personalBest: 10,
    sortOrder: 0,
    archived: false,
    ...overrides,
  };
}

// ─── initStorage ──────────────────────────────────────────────────────────────

describe("initStorage", () => {
  it("seeds 25 default exercises on first call", () => {
    initStorage();
    const exercises = getExercises();
    expect(exercises.length).toBeGreaterThanOrEqual(25);
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

// ─── resetExercises ───────────────────────────────────────────────────────────

describe("resetExercises", () => {
  it("replaces all exercises with the 25+ defaults", () => {
    createExercise(makeExercise({ name: "Custom" }));
    resetExercises();
    const exercises = getExercises();
    expect(exercises.length).toBeGreaterThanOrEqual(25);
    expect(exercises.find((e) => e.name === "Custom")).toBeUndefined();
  });

  it("does not touch sessions", () => {
    const session = startSession();
    resetExercises();
    const sessions = getSessions();
    expect(sessions.find((s) => s.id === session.id)).toBeDefined();
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
});

// ─── logSet ───────────────────────────────────────────────────────────────────

describe("logSet", () => {
  it("creates a SessionSet record with correct fields", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 8, personalBest: 10 }));
    const set = logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 9, isPb: false });
    expect(set.sessionId).toBe(session.id);
    expect(set.exerciseId).toBe(ex.id);
    expect(set.repsAchieved).toBe(9);
    expect(set.weight).toBe(20);
  });

  it("updates exercise.lastReps to the logged value", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 8 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 10, isPb: false });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastReps).toBe(10);
  });

  it("updates exercise.personalBest when isPb is true", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 8, personalBest: 8 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 12, isPb: true });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.personalBest).toBe(12);
  });

  it("does not change exercise.personalBest when isPb is false", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 10, personalBest: 10 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8, isPb: false });
    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.personalBest).toBe(10);
  });

  it("snapshots prevLastReps and prevPersonalBest before mutating", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 7, personalBest: 9 }));
    const set = logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 11, isPb: true });
    expect(set.prevLastReps).toBe(7);
    expect(set.prevPersonalBest).toBe(9);
  });

  it("getSessionSets returns the logged set for the correct session", () => {
    const session = startSession();
    const ex = createExercise(makeExercise());
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8, isPb: false });
    const sets = getSessionSets(session.id);
    expect(sets.length).toBe(1);
    expect(sets[0].exerciseId).toBe(ex.id);
  });

  it("getSessionSets does not return sets from other sessions", () => {
    const s1 = startSession();
    const s2 = startSession();
    const ex = createExercise(makeExercise());
    logSet({ sessionId: s1.id, exerciseId: ex.id, weight: 20, repsAchieved: 8, isPb: false });
    expect(getSessionSets(s2.id).length).toBe(0);
  });
});

// ─── undoSet ──────────────────────────────────────────────────────────────────

describe("undoSet", () => {
  it("removes the most recent set for the exercise", () => {
    const session = startSession();
    const ex = createExercise(makeExercise());
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8, isPb: false });
    undoSet(session.id, ex.id);
    expect(getSessionSets(session.id).length).toBe(0);
  });

  it("restores exercise.lastReps and exercise.personalBest to pre-set values", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 7, personalBest: 7 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 12, isPb: true });
    undoSet(session.id, ex.id);
    const restored = getExercises().find((e) => e.id === ex.id);
    expect(restored?.lastReps).toBe(7);
    expect(restored?.personalBest).toBe(7);
  });

  it("only removes the most recent set when multiple sets exist", () => {
    const session = startSession();
    const ex = createExercise(makeExercise({ lastReps: 5 }));
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 6, isPb: false });
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8, isPb: false });
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
    syncCategoriesFromExercises([{ category: "Back" }]);
    expect(getCategories().length).toBe(before);
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
    replaceExercises([makeExercise({ category: "Back" })]);
    const count = getCategories().filter((c) => c === "Back").length;
    expect(count).toBe(1);
  });
});
