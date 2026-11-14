import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiftTracker from "./LiftTracker";
import { createExercise, getCategories, saveSettings, getSettings, DEFAULT_SETTINGS, getSessionSets, getExercises, getActiveSession, logSet } from "@/lib/storage";
import { COACH_NOTES_CACHE_KEY, COACH_NOTES_URL } from "@/lib/coachNotes";
import { buildExportText } from "@/components/ImportExport";

Element.prototype.scrollIntoView = vi.fn();

const NOW = new Date("2026-11-05T09:00:00Z"); // 09:00 in London (GMT)

function notesFile(overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    date: "2026-11-05",
    generatedAt: "2026-11-04T20:55:00Z",
    session: { focus: "Legs", note: "Short rests today." },
    exercises: {
      "goblet squat ": { target: "3 × 8–10 @ 22 kg/hand", note: "Pause at the bottom." },
      "Not In My App": { target: "1 × 1", note: "ignored" },
    },
    ...overrides,
  };
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function seedExercises() {
  const category = getCategories()[0];
  createExercise({ name: "Goblet Squat", category, weight: 22, maxReps: 10, sets: 3, lastReps: 8, sortOrder: 0, archived: false });
  createExercise({ name: "Leg Press", category, weight: 80, maxReps: 12, sets: 3, lastReps: 10, sortOrder: 1, archived: false });
}

function enableCoachNotes() {
  saveSettings({ ...DEFAULT_SETTINGS, showCoachNotes: true });
}

function cardFor(name: string): HTMLElement {
  const nameEl = screen.getAllByTestId("exercise-name").find((el) => el.textContent === name)!;
  return nameEl.closest(".exercise-card") as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock = vi.fn().mockResolvedValue(okResponse(notesFile()));
  vi.stubGlobal("fetch", fetchMock);
  seedExercises();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Setting ─────────────────────────────────────────────────────────────────

describe("coach notes setting", () => {
  it("is off by default", () => {
    expect(getSettings().showCoachNotes).toBe(false);
  });

  it("when off, nothing is rendered and nothing is fetched (even with today's notes cached)", async () => {
    localStorage.setItem(COACH_NOTES_CACHE_KEY, JSON.stringify(notesFile()));
    render(<LiftTracker />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("coach-session-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-exercise-note")).not.toBeInTheDocument();
  });

  it("turning it on in Settings fetches and shows notes; turning it off hides them", async () => {
    const user = userEvent.setup();
    render(<LiftTracker />);
    await user.click(screen.getByTestId("btn-open-settings"));
    const toggle = screen.getByTestId("toggle-coach-notes");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    expect(getSettings().showCoachNotes).toBe(true);
    await screen.findByTestId("coach-session-banner");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(toggle);
    expect(screen.queryByTestId("coach-session-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-exercise-note")).not.toBeInTheDocument();
  });
});

// ─── Rendering ───────────────────────────────────────────────────────────────

describe("coach notes rendering", () => {
  beforeEach(enableCoachNotes);

  it("fetches the notes URL with a cache-busting param on load", async () => {
    render(<LiftTracker />);
    await screen.findByTestId("coach-session-banner");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url.startsWith(`${COACH_NOTES_URL}?t=`)).toBe(true);
    expect(url).toBe(`${COACH_NOTES_URL}?t=${Math.floor(NOW.getTime() / 60000)}`);
  });

  it("shows the session banner with focus and note", async () => {
    render(<LiftTracker />);
    const banner = await screen.findByTestId("coach-session-banner");
    expect(within(banner).getByText("Coach")).toBeInTheDocument();
    expect(within(banner).getByTestId("coach-session-focus")).toHaveTextContent("Legs");
    expect(within(banner).getByTestId("coach-session-note")).toHaveTextContent("Short rests today.");
  });

  it("shows target and note under a matching exercise (case/whitespace-insensitive), nothing under others", async () => {
    render(<LiftTracker />);
    await screen.findByTestId("coach-session-banner");
    const squat = within(cardFor("Goblet Squat"));
    expect(squat.getByTestId("coach-exercise-target")).toHaveTextContent("3 × 8–10 @ 22 kg/hand");
    expect(squat.getByTestId("coach-exercise-note-text")).toHaveTextContent("Pause at the bottom.");
    expect(within(cardFor("Leg Press")).queryByTestId("coach-exercise-note")).not.toBeInTheDocument();
    // Only one exercise note in total — the unknown "Not In My App" entry is ignored.
    expect(screen.getAllByTestId("coach-exercise-note")).toHaveLength(1);
  });

  it("renders the session before the fetch resolves (never blocks)", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((r) => { resolve = r; }));
    render(<LiftTracker />);
    expect(screen.getAllByTestId("exercise-name")).toHaveLength(2);
    expect(screen.queryByTestId("coach-session-banner")).not.toBeInTheDocument();
    await act(async () => { resolve(okResponse(notesFile())); });
    expect(screen.getByTestId("coach-session-banner")).toBeInTheDocument();
  });

  it("refetches when a session is started", async () => {
    const user = userEvent.setup();
    render(<LiftTracker />);
    await screen.findByTestId("coach-session-banner");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId("btn-start-session"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("coach-session-banner")).toBeInTheDocument();
  });
});

// ─── Date gating ─────────────────────────────────────────────────────────────

describe("coach notes date gating", () => {
  beforeEach(enableCoachNotes);

  it.each([
    ["yesterday", "2026-11-04"],
    ["tomorrow", "2026-11-06"],
  ])("shows nothing for %s's notes", async (_label, date) => {
    fetchMock.mockResolvedValue(okResponse(notesFile({ date })));
    render(<LiftTracker />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId("coach-session-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-exercise-note")).not.toBeInTheDocument();
  });

  it("just after midnight in London (BST, UTC still the previous day) shows the new day's notes", async () => {
    vi.setSystemTime(new Date("2026-07-14T23:10:00Z")); // 00:10 BST, 15 July
    fetchMock.mockResolvedValue(okResponse(notesFile({ date: "2026-07-15" })));
    render(<LiftTracker />);
    expect(await screen.findByTestId("coach-session-banner")).toBeInTheDocument();
  });

  it("just after midnight in London (BST) hides the previous UTC day's notes", async () => {
    vi.setSystemTime(new Date("2026-07-14T23:10:00Z"));
    fetchMock.mockResolvedValue(okResponse(notesFile({ date: "2026-07-14" })));
    render(<LiftTracker />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId("coach-session-banner")).not.toBeInTheDocument();
  });
});

// ─── Failure modes ───────────────────────────────────────────────────────────

describe("coach notes failure modes", () => {
  beforeEach(enableCoachNotes);

  it.each([
    ["fetch error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["404", () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)],
    ["malformed JSON", () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } } as unknown as Response)],
    ["schema != 1", () => Promise.resolve(okResponse(notesFile({ schema: 2 })))],
  ])("%s → no notes, no error UI, app still works", async (_label, impl) => {
    fetchMock.mockImplementation(impl);
    const user = userEvent.setup();
    render(<LiftTracker />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId("coach-session-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-exercise-note")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("exercise-name")).toHaveLength(2);
    await user.click(screen.getByTestId("btn-start-session"));
    expect(screen.getByTestId("btn-end-session")).toBeInTheDocument();
  });
});

// ─── Offline cache ───────────────────────────────────────────────────────────

describe("coach notes offline cache", () => {
  beforeEach(enableCoachNotes);

  it("renders cached notes for today when the network is unavailable", async () => {
    localStorage.setItem(COACH_NOTES_CACHE_KEY, JSON.stringify(notesFile()));
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<LiftTracker />);
    // Cached notes are available synchronously on first render.
    expect(screen.getByTestId("coach-session-banner")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByTestId("coach-session-banner")).toBeInTheDocument();
    expect(within(cardFor("Goblet Squat")).getByTestId("coach-exercise-note")).toBeInTheDocument();
  });

  it("does not render cached notes for another day", async () => {
    localStorage.setItem(COACH_NOTES_CACHE_KEY, JSON.stringify(notesFile({ date: "2026-11-04" })));
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<LiftTracker />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId("coach-session-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-exercise-note")).not.toBeInTheDocument();
  });

  it("stores the last successful response for later offline use", async () => {
    render(<LiftTracker />);
    await screen.findByTestId("coach-session-banner");
    expect(JSON.parse(localStorage.getItem(COACH_NOTES_CACHE_KEY)!).date).toBe("2026-11-05");
  });
});

// ─── Read-only ───────────────────────────────────────────────────────────────

describe("coach notes are read-only", () => {
  beforeEach(enableCoachNotes);

  it("are not written into session logs or exports", async () => {
    const user = userEvent.setup();
    render(<LiftTracker />);
    await screen.findByTestId("coach-session-banner");
    await user.click(screen.getByTestId("btn-start-session"));
    const sessionId = getActiveSession()!.id;
    const ex = getExercises().find((e) => e.name === "Goblet Squat")!;
    logSet({ sessionId, exerciseId: ex.id, weight: ex.weight, repsAchieved: 8 });
    const dump = JSON.stringify({ sets: getSessionSets(sessionId), exercises: getExercises() }) + buildExportText(getExercises());
    expect(dump).not.toMatch(/Pause at the bottom|Short rests|22 kg\/hand/);
  });
});
