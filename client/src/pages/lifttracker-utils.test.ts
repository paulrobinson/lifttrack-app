// jsdom environment (default) is used here.
// CompressionStream / DecompressionStream / Response are available as Node 18+
// globals and remain accessible within the jsdom environment.

import { describe, it, expect } from "vitest";
import { parseImportText, buildExportText, encodeState, decodeState } from "./LiftTracker";
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
    personalBest: 10,
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

  it("sets personalBest equal to lastReps on import", () => {
    const result = parseImportText(SAMPLE_TEXT);
    if (!result.ok) throw new Error("unreachable");
    expect(result.exercises[0].personalBest).toBe(result.exercises[0].lastReps);
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
