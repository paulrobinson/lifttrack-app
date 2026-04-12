// jsdom environment (default) is used here.
// CompressionStream / DecompressionStream / Response are available as Node 18+
// globals and remain accessible within the jsdom environment.

import { describe, it, expect } from "vitest";
import { parseImportText, buildExportText, encodeState, decodeState, computeSetOutcome, getCategorySummary, buildHistoryData } from "./LiftTracker";
import type { HistoryExerciseEntry } from "./LiftTracker";
import { createExercise, startSession, endSession, logSet } from "@/lib/storage";
import type { Exercise } from "@/lib/storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    name: "Pull Ups",
    category: "Back",
    weight: 0,
    maxReps: 12,
    sets: 3,
    lastReps: 8,
    sortOrder: 0,
    archived: false,
    ...overrides,
  };
}

const SAMPLE_TEXT = `Back
—————————————————
Exercise : Pull Ups
Max reps : 12
Weight : 0
Sets : 3
Reps : 8

Legs
—————————————————
Exercise : Front Squat
Max reps : 8
Weight : 60
Sets : 3
Reps : 6
`;

// ─── parseImportText ──────────────────────────────────────────────────────────

describe("parseImportText", () => {
  it("parses a valid multi-category text block", () => {
    const result = parseImportText(SAMPLE_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises.length).toBe(2);
    expect(result.exercises[0].name).toBe("Pull Ups");
    expect(result.exercises[0].category).toBe("Back");
    expect(result.exercises[1].name).toBe("Front Squat");
    expect(result.exercises[1].category).toBe("Legs");
  });

  it("parses numeric fields correctly", () => {
    const result = parseImportText(SAMPLE_TEXT);
    if (!result.ok) throw new Error("unreachable");
    const ex = result.exercises[0];
    expect(ex.maxReps).toBe(12);
    expect(ex.weight).toBe(0);
    expect(ex.sets).toBe(3);
    expect(ex.lastReps).toBe(8);
  });

  it("strips non-numeric suffixes from weight (e.g. '60kg' → 60)", () => {
    const text = `Upper\n—————\nExercise : DB Row\nMax reps : 12\nWeight : 60kg\nSets : 3\nReps : 8\n`;
    const result = parseImportText(text);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].weight).toBe(60);
  });

  it("returns ok: false when no exercises are found", () => {
    const result = parseImportText("   \n\n  ");
    expect(result.ok).toBe(false);
  });

  it("returns ok: false with a helpful message when a required field is missing", () => {
    const text = `Upper\n—————\nExercise : DB Row\nMax reps : 12\nSets : 3\nReps : 8\n`;
    const result = parseImportText(text);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toMatch(/weight/i);
  });

  it("returns ok: false when a field value is not a number", () => {
    const text = `Upper\n—————\nExercise : DB Row\nMax reps : twelve\nWeight : 20\nSets : 3\nReps : 8\n`;
    const result = parseImportText(text);
    expect(result.ok).toBe(false);
  });

  it("handles dash-style dividers as well as em-dash dividers", () => {
    const text = `Chest\n---\nExercise : Bench\nMax reps : 8\nWeight : 60\nSets : 3\nReps : 6\n`;
    const result = parseImportText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].name).toBe("Bench");
  });

});

// ─── buildExportText ──────────────────────────────────────────────────────────

describe("buildExportText", () => {
  it("includes all non-archived exercises", () => {
    const exercises: Exercise[] = [
      makeExercise({ id: 1, name: "Pull Ups", category: "Back" }),
      makeExercise({ id: 2, name: "DB Press", category: "Chest" }),
    ];
    const text = buildExportText(exercises);
    expect(text).toContain("Pull Ups");
    expect(text).toContain("DB Press");
  });

  it("excludes archived exercises", () => {
    const exercises: Exercise[] = [
      makeExercise({ id: 1, name: "Pull Ups", archived: false }),
      makeExercise({ id: 2, name: "Old Move", archived: true }),
    ];
    const text = buildExportText(exercises);
    expect(text).not.toContain("Old Move");
  });

  it("groups exercises under their category name", () => {
    const exercises: Exercise[] = [
      makeExercise({ id: 1, name: "Pull Ups", category: "Back" }),
      makeExercise({ id: 2, name: "Squat", category: "Legs" }),
    ];
    const text = buildExportText(exercises);
    const backIdx = text.indexOf("Back");
    const pullUpsIdx = text.indexOf("Pull Ups");
    const legsIdx = text.indexOf("Legs");
    const squatIdx = text.indexOf("Squat");
    expect(backIdx).toBeLessThan(pullUpsIdx);
    expect(legsIdx).toBeLessThan(squatIdx);
  });

  it("produces output that parseImportText can round-trip", () => {
    const exercises: Exercise[] = [
      makeExercise({ id: 1, name: "Pull Ups", category: "Back", weight: 0, maxReps: 12, sets: 3, lastReps: 8 }),
      makeExercise({ id: 2, name: "Squat", category: "Legs", weight: 60, maxReps: 8, sets: 3, lastReps: 6 }),
    ];
    const text = buildExportText(exercises);
    const result = parseImportText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises.length).toBe(2);
    expect(result.exercises[0].name).toBe("Pull Ups");
    expect(result.exercises[1].name).toBe("Squat");
  });
});

// ─── custom category names in import/export ───────────────────────────────────

describe("parseImportText with custom category names", () => {
  it("accepts any string as a category header", () => {
    const text = `Aquatics\n—————\nExercise : Swimming Laps\nMax reps : 10\nWeight : 0\nSets : 4\nReps : 8\n`;
    const result = parseImportText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].category).toBe("Aquatics");
  });

  it("handles multi-word custom category names", () => {
    const text = `High Intensity\n—————\nExercise : Burpees\nMax reps : 20\nWeight : 0\nSets : 3\nReps : 15\n`;
    const result = parseImportText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].category).toBe("High Intensity");
  });

  it("round-trips custom category names through buildExportText → parseImportText", () => {
    const exercises: import("@/lib/storage").Exercise[] = [
      makeExercise({ id: 1, name: "Swimming Laps", category: "Aquatics", weight: 0, maxReps: 10, sets: 4, lastReps: 8 }),
      makeExercise({ id: 2, name: "Yoga Flow",    category: "Mindfulness", weight: 0, maxReps: 5, sets: 1, lastReps: 5 }),
    ];
    const text = buildExportText(exercises);
    expect(text).toContain("Aquatics");
    expect(text).toContain("Mindfulness");
    const result = parseImportText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].category).toBe("Aquatics");
    expect(result.exercises[1].category).toBe("Mindfulness");
  });
});

// ─── encodeState / decodeState ────────────────────────────────────────────────

describe("encodeState / decodeState", () => {
  it("roundtrips a list of exercises losslessly", async () => {
    const exercises: Exercise[] = [
      makeExercise({ id: 1, name: "Pull Ups" }),
      makeExercise({ id: 2, name: "Squat", weight: 60 }),
    ];
    const code = await encodeState(exercises);
    const decoded = await decodeState(code);
    expect(decoded).toEqual(exercises);
  });

  it("produces a string with no characters that break WhatsApp/SMS (+, /, =)", async () => {
    const exercises: Exercise[] = [makeExercise()];
    const code = await encodeState(exercises);
    expect(code).not.toMatch(/[+/=]/);
  });

  it("roundtrips an empty array", async () => {
    const code = await encodeState([]);
    const decoded = await decodeState(code);
    expect(decoded).toEqual([]);
  });

  it("roundtrips exercises with unicode characters in the name", async () => {
    const exercises: Exercise[] = [makeExercise({ name: "Ünter-Übung 💪" })];
    const code = await encodeState(exercises);
    const decoded = await decodeState(code);
    expect(decoded[0].name).toBe("Ünter-Übung 💪");
  });

  it("throws on invalid / corrupt input", async () => {
    await expect(decodeState("not-valid-base64url!!")).rejects.toThrow();
  });
});

// ─── computeSetOutcome ────────────────────────────────────────────────────────

describe("computeSetOutcome", () => {
  it("returns up when reps exceed prevReps at the same weight", () => {
    const result = computeSetOutcome(10, 20, 8, 20);
    expect(result.up).toBe(true);
    expect(result.decline).toBe(false);
  });

  it("returns decline when reps are below prevReps", () => {
    const result = computeSetOutcome(6, 20, 8, 20);
    expect(result.decline).toBe(true);
    expect(result.up).toBe(false);
  });

  it("returns decline when weight is below prevWeight", () => {
    const result = computeSetOutcome(8, 15, 8, 20);
    expect(result.decline).toBe(true);
    expect(result.up).toBe(false);
  });

  it("returns neither when reps equal prevReps at same weight", () => {
    const result = computeSetOutcome(8, 20, 8, 20);
    expect(result.up).toBe(false);
    expect(result.decline).toBe(false);
  });

  it("returns neither when prevReps is null (first log)", () => {
    const result = computeSetOutcome(10, 20, null, 20);
    expect(result.up).toBe(false);
    expect(result.decline).toBe(false);
  });

  it("returns neither when prevReps is 0 (no history)", () => {
    const result = computeSetOutcome(10, 20, 0, 20);
    expect(result.up).toBe(false);
    expect(result.decline).toBe(false);
  });

  it("returns decline when both reps and weight drop", () => {
    const result = computeSetOutcome(5, 15, 8, 20);
    expect(result.decline).toBe(true);
    expect(result.up).toBe(false);
  });
});

// ─── getCategorySummary ────────────────────────────────────────────────────────

function makeHistoryEntry(category: string): HistoryExerciseEntry {
  return {
    exerciseId: 1,
    exerciseName: "Test",
    category,
    weight: 20,
    repsAchieved: 8,
    prevLastReps: null,
    weightIncreased: false,
  };
}

describe("getCategorySummary", () => {
  it("returns null for an empty array", () => {
    expect(getCategorySummary([])).toBeNull();
  });

  it("returns 'All X' when every exercise is in the same category", () => {
    const entries = [makeHistoryEntry("Chest"), makeHistoryEntry("Chest"), makeHistoryEntry("Chest")];
    expect(getCategorySummary(entries)).toBe("All Chest");
  });

  it("returns 'Mostly X' when one category is a strict majority", () => {
    const entries = [makeHistoryEntry("Back"), makeHistoryEntry("Back"), makeHistoryEntry("Legs")];
    expect(getCategorySummary(entries)).toBe("Mostly Back");
  });

  it("returns null when no category has a strict majority", () => {
    const entries = [makeHistoryEntry("Back"), makeHistoryEntry("Chest")];
    expect(getCategorySummary(entries)).toBeNull();
  });

  it("returns null when no category has a strict majority across three categories", () => {
    const entries = [
      makeHistoryEntry("Back"),
      makeHistoryEntry("Chest"),
      makeHistoryEntry("Legs"),
    ];
    expect(getCategorySummary(entries)).toBeNull();
  });
});

// ─── buildHistoryData ─────────────────────────────────────────────────────────

function makeStorageExercise(overrides: Partial<Exercise> = {}): Omit<Exercise, "id"> {
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

describe("buildHistoryData", () => {
  it("returns an empty array when there are no sessions", () => {
    expect(buildHistoryData()).toEqual([]);
  });

  it("excludes an in-progress (not ended) session", () => {
    const ex = createExercise(makeStorageExercise());
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    // session never ended
    expect(buildHistoryData()).toEqual([]);
  });

  it("excludes a completed session that has no sets", () => {
    const session = startSession();
    endSession(session.id);
    expect(buildHistoryData()).toEqual([]);
  });

  it("includes a completed session that has sets", () => {
    const ex = createExercise(makeStorageExercise());
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    endSession(session.id);
    const data = buildHistoryData();
    expect(data).toHaveLength(1);
    expect(data[0].session.id).toBe(session.id);
  });

  it("orders sessions most-recent-first", () => {
    const ex = createExercise(makeStorageExercise());
    const s1 = startSession();
    logSet({ sessionId: s1.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    endSession(s1.id);
    const s2 = startSession();
    logSet({ sessionId: s2.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    endSession(s2.id);
    const data = buildHistoryData();
    expect(data[0].session.id).toBe(s2.id);
    expect(data[1].session.id).toBe(s1.id);
  });

  it("sets weightIncreased=false on the first session for an exercise", () => {
    const ex = createExercise(makeStorageExercise());
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    endSession(session.id);
    const entry = buildHistoryData()[0].exercises[0];
    expect(entry.weightIncreased).toBe(false);
  });

  it("sets weightIncreased=true when weight goes up between sessions", () => {
    const ex = createExercise(makeStorageExercise());
    const s1 = startSession();
    logSet({ sessionId: s1.id, exerciseId: ex.id, weight: 20, repsAchieved: 8 });
    endSession(s1.id);
    const s2 = startSession();
    logSet({ sessionId: s2.id, exerciseId: ex.id, weight: 25, repsAchieved: 8 });
    endSession(s2.id);
    // Most recent session is first; its exercise entry should show weight increased
    const latestEntry = buildHistoryData()[0].exercises[0];
    expect(latestEntry.weightIncreased).toBe(true);
  });

  it("preserves the prevLastReps snapshot from logSet", () => {
    const ex = createExercise(makeStorageExercise({ lastReps: 6 }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 10 });
    endSession(session.id);
    const entry = buildHistoryData()[0].exercises[0];
    expect(entry.prevLastReps).toBe(6);
  });

  it("includes the exercise category on each entry", () => {
    const ex = createExercise(makeStorageExercise({ category: "Legs" }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 60, repsAchieved: 8 });
    endSession(session.id);
    const entry = buildHistoryData()[0].exercises[0];
    expect(entry.category).toBe("Legs");
  });
});

// ─── parseImportText – multi-set reps ─────────────────────────────────────────

describe("parseImportText with multi-set reps", () => {
  it("parses a comma-separated reps field into lastRepsSets", () => {
    const text = `Back\n—————\nExercise : Pull Ups\nMax reps : 12\nWeight : 0\nSets : 4\nReps : 10, 10, 10, 9\n`;
    const result = parseImportText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const ex = result.exercises[0];
    expect(ex.lastRepsSets).toEqual([10, 10, 10, 9]);
  });

  it("sets lastReps to the first value from a multi-set reps field", () => {
    const text = `Back\n—————\nExercise : Pull Ups\nMax reps : 12\nWeight : 0\nSets : 4\nReps : 10, 10, 10, 9\n`;
    const result = parseImportText(text);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].lastReps).toBe(10);
  });

  it("derives sets count from the number of rep values when multiple are given", () => {
    const text = `Back\n—————\nExercise : Pull Ups\nMax reps : 12\nWeight : 0\nSets : 3\nReps : 10, 10, 9\n`;
    const result = parseImportText(text);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].sets).toBe(3);
    expect(result.exercises[0].lastRepsSets).toEqual([10, 10, 9]);
  });

  it("overrides the Sets field with the reps count when they differ", () => {
    // Sets says 3 but reps has 4 values — reps count wins
    const text = `Back\n—————\nExercise : Pull Ups\nMax reps : 12\nWeight : 0\nSets : 3\nReps : 10, 10, 10, 9\n`;
    const result = parseImportText(text);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].sets).toBe(4);
  });

  it("does NOT set lastRepsSets for a single rep value", () => {
    const text = `Back\n—————\nExercise : Pull Ups\nMax reps : 12\nWeight : 0\nSets : 3\nReps : 8\n`;
    const result = parseImportText(text);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].lastRepsSets).toBeUndefined();
    expect(result.exercises[0].lastReps).toBe(8);
  });

  it("fails gracefully when reps values are all non-numeric", () => {
    const text = `Back\n—————\nExercise : Pull Ups\nMax reps : 12\nWeight : 0\nSets : 3\nReps : abc, def\n`;
    const result = parseImportText(text);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toMatch(/reps/i);
  });
});

// ─── buildExportText – multi-set reps ─────────────────────────────────────────

describe("buildExportText with multi-set reps", () => {
  it("outputs comma-separated reps when lastRepsSets is present", () => {
    const exercises: Exercise[] = [
      makeExercise({ id: 1, name: "Pull Ups", category: "Back", lastReps: 10, lastRepsSets: [10, 10, 10, 9], sets: 4 }),
    ];
    const text = buildExportText(exercises);
    expect(text).toContain("Reps : 10, 10, 10, 9");
  });

  it("outputs a single number when lastRepsSets is absent", () => {
    const exercises: Exercise[] = [
      makeExercise({ id: 1, name: "Pull Ups", category: "Back", lastReps: 8, sets: 3 }),
    ];
    const text = buildExportText(exercises);
    expect(text).toContain("Reps : 8");
    expect(text).not.toContain(",");
  });

  it("round-trips multi-set reps through buildExportText → parseImportText", () => {
    const exercises: Exercise[] = [
      makeExercise({ id: 1, name: "Pull Ups", category: "Back", weight: 0, maxReps: 12, sets: 4, lastReps: 10, lastRepsSets: [10, 10, 10, 9] }),
    ];
    const text = buildExportText(exercises);
    const result = parseImportText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].lastRepsSets).toEqual([10, 10, 10, 9]);
    expect(result.exercises[0].sets).toBe(4);
    expect(result.exercises[0].lastReps).toBe(10);
  });
});
