import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  COACH_NOTES_CACHE_KEY,
  COACH_NOTES_URL,
  coachNotesUrl,
  fetchCoachNotes,
  findExerciseNote,
  isForToday,
  loadCachedCoachNotesForToday,
  londonDate,
  parseCoachNotes,
  readCachedCoachNotes,
} from "./coachNotes";

function sample(overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    date: "2026-11-05",
    generatedAt: "2026-11-04T20:55:00Z",
    session: { focus: "Legs", note: "Keep rest to 90s." },
    exercises: {
      "Goblet Squat": { target: "3 × 8–10 @ 22 kg/hand", note: "Pause at the bottom." },
    },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Date gating ─────────────────────────────────────────────────────────────

describe("londonDate / isForToday", () => {
  it("returns the Europe/London calendar date in winter (GMT)", () => {
    expect(londonDate(new Date("2026-11-05T00:05:00Z"))).toBe("2026-11-05");
    expect(londonDate(new Date("2026-11-04T23:59:00Z"))).toBe("2026-11-04");
  });

  it("uses local London time, not UTC, in summer (BST)", () => {
    // 23:30 UTC on 14 July is 00:30 BST on 15 July.
    expect(londonDate(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
    // 00:30 UTC on 15 July is 01:30 BST — still 15 July.
    expect(londonDate(new Date("2026-07-15T00:30:00Z"))).toBe("2026-07-15");
  });

  it("today's notes show; yesterday's and tomorrow's do not", () => {
    const now = new Date("2026-11-05T09:00:00Z");
    expect(isForToday(parseCoachNotes(sample({ date: "2026-11-05" })), now)).toBe(true);
    expect(isForToday(parseCoachNotes(sample({ date: "2026-11-04" })), now)).toBe(false);
    expect(isForToday(parseCoachNotes(sample({ date: "2026-11-06" })), now)).toBe(false);
  });

  it("just after midnight London time (BST) the new day's notes show, even though UTC is still the previous day", () => {
    const now = new Date("2026-07-14T23:10:00Z"); // 00:10 BST on 15 July
    expect(isForToday(parseCoachNotes(sample({ date: "2026-07-15" })), now)).toBe(true);
    expect(isForToday(parseCoachNotes(sample({ date: "2026-07-14" })), now)).toBe(false);
  });

  it("just after midnight UTC in winter, the UTC/London date's notes show and the previous day's don't", () => {
    const now = new Date("2026-11-05T00:01:00Z");
    expect(isForToday(parseCoachNotes(sample({ date: "2026-11-05" })), now)).toBe(true);
    expect(isForToday(parseCoachNotes(sample({ date: "2026-11-04" })), now)).toBe(false);
  });

  it("null notes are never for today", () => {
    expect(isForToday(null)).toBe(false);
  });
});

// ─── Parsing ─────────────────────────────────────────────────────────────────

describe("parseCoachNotes", () => {
  it("accepts a valid schema-1 document", () => {
    const notes = parseCoachNotes(sample());
    expect(notes).not.toBeNull();
    expect(notes!.session).toEqual({ focus: "Legs", note: "Keep rest to 90s." });
    expect(notes!.exercises["goblet squat"]).toEqual({ target: "3 × 8–10 @ 22 kg/hand", note: "Pause at the bottom." });
  });

  it.each([
    ["schema 2", sample({ schema: 2 })],
    ["schema as string", sample({ schema: "1" })],
    ["missing schema", (() => { const s: Record<string, unknown> = sample(); delete s.schema; return s; })()],
    ["missing date", sample({ date: undefined })],
    ["badly formatted date", sample({ date: "05/11/2026" })],
    ["null", null],
    ["array", []],
    ["string", "hello"],
  ])("rejects %s", (_label, input) => {
    expect(parseCoachNotes(input)).toBeNull();
  });

  it("drops malformed exercise entries but keeps good ones", () => {
    const notes = parseCoachNotes(sample({
      exercises: {
        "Good": { target: "3 × 8", note: "ok" },
        "Bad": "not an object",
        "Empty": { target: 5, note: null },
      },
    }));
    expect(Object.keys(notes!.exercises)).toEqual(["good"]);
  });

  it("tolerates a missing session block", () => {
    const notes = parseCoachNotes(sample({ session: undefined }));
    expect(notes!.session).toBeNull();
  });
});

// ─── Name matching ───────────────────────────────────────────────────────────

describe("findExerciseNote", () => {
  const notes = parseCoachNotes(sample({
    exercises: {
      "  Goblet Squat ": { target: "3 × 8", note: "a" },
      "Romanian Deadlift": { target: "3 × 10", note: "b" },
    },
  }));

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(findExerciseNote(notes, "goblet squat")?.note).toBe("a");
    expect(findExerciseNote(notes, "GOBLET SQUAT")?.note).toBe("a");
    expect(findExerciseNote(notes, "  romanian deadlift  ")?.note).toBe("b");
  });

  it("returns null for unknown names", () => {
    expect(findExerciseNote(notes, "Bench Press")).toBeNull();
    expect(findExerciseNote(null, "Goblet Squat")).toBeNull();
  });
});

// ─── Fetching ────────────────────────────────────────────────────────────────

describe("fetchCoachNotes", () => {
  const now = new Date("2026-11-05T09:00:00Z");

  it("adds a cache-busting param in epoch minutes", () => {
    expect(coachNotesUrl(now)).toBe(`${COACH_NOTES_URL}?t=${Math.floor(now.getTime() / 60000)}`);
  });

  it("fetches the notes URL and caches a valid response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sample()));
    const notes = await fetchCoachNotes(fetchMock as unknown as typeof fetch, now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(coachNotesUrl(now));
    expect(notes?.date).toBe("2026-11-05");
    expect(readCachedCoachNotes()?.date).toBe("2026-11-05");
  });

  it.each([
    ["network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["404", () => Promise.resolve(jsonResponse("Not Found", 404))],
    ["malformed JSON", () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } } as unknown as Response)],
    ["schema != 1", () => Promise.resolve(jsonResponse(sample({ schema: 2 })))],
  ])("resolves to null without throwing on %s, and leaves the cache alone", async (_label, impl) => {
    localStorage.setItem(COACH_NOTES_CACHE_KEY, JSON.stringify(sample()));
    const fetchMock = vi.fn(impl);
    await expect(fetchCoachNotes(fetchMock as unknown as typeof fetch, now)).resolves.toBeNull();
    expect(readCachedCoachNotes()?.date).toBe("2026-11-05");
    expect(console.warn).toHaveBeenCalled();
  });

  it("does not overwrite newer cached notes with an older (stale CDN) response", async () => {
    localStorage.setItem(COACH_NOTES_CACHE_KEY, JSON.stringify(sample({ date: "2026-11-05" })));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sample({ date: "2026-11-04" })));
    await fetchCoachNotes(fetchMock as unknown as typeof fetch, now);
    expect(readCachedCoachNotes()?.date).toBe("2026-11-05");
  });
});

// ─── Cache ───────────────────────────────────────────────────────────────────

describe("loadCachedCoachNotesForToday", () => {
  const now = new Date("2026-11-05T09:00:00Z");

  it("returns cached notes dated today", () => {
    localStorage.setItem(COACH_NOTES_CACHE_KEY, JSON.stringify(sample()));
    expect(loadCachedCoachNotesForToday(now)?.date).toBe("2026-11-05");
  });

  it("ignores cached notes for another day", () => {
    localStorage.setItem(COACH_NOTES_CACHE_KEY, JSON.stringify(sample({ date: "2026-11-04" })));
    expect(loadCachedCoachNotesForToday(now)).toBeNull();
  });

  it("ignores corrupt cache contents", () => {
    localStorage.setItem(COACH_NOTES_CACHE_KEY, "{not json");
    expect(loadCachedCoachNotesForToday(now)).toBeNull();
  });

  it("survives localStorage throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadCachedCoachNotesForToday(now)).toBeNull();
  });
});
