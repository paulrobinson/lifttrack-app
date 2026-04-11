import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiftTracker from "./LiftTracker";
import { createExercise, updateExercise, getExercises, getActiveSession, saveExercisesOrder } from "@/lib/storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExercise(overrides = {}) {
  return {
    name: "Pull Ups",
    category: "Back",
    weight: 0,
    maxReps: 12,
    sets: 3,
    lastReps: 8,
    personalBest: 8,
    sortOrder: 0,
    archived: false,
    ...overrides,
  };
}

function renderApp() {
  return render(<LiftTracker />);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("initial render", () => {
  it("shows the LiftTrack logo / app name", () => {
    renderApp();
    expect(screen.getByText("LiftTrack")).toBeInTheDocument();
  });

  it("shows Start Workout button when no session is active", () => {
    renderApp();
    expect(screen.getByTestId("btn-start-session")).toBeInTheDocument();
  });

  it("shows default exercises from seeds", () => {
    renderApp();
    // At least one default exercise name should appear
    expect(screen.getByText("Pull Ups")).toBeInTheDocument();
  });
});

// ─── Tab navigation ───────────────────────────────────────────────────────────

describe("tab navigation", () => {
  it("renders category tabs for each category that has exercises", () => {
    renderApp();
    expect(screen.getByTestId("tab-back")).toBeInTheDocument();
    expect(screen.getByTestId("tab-chest")).toBeInTheDocument();
    expect(screen.getByTestId("tab-upper")).toBeInTheDocument();
    expect(screen.getByTestId("tab-legs")).toBeInTheDocument();
  });

  it("clicking a different tab shows exercises from that category", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("tab-chest"));
    expect(screen.getByText("Pec Deck")).toBeInTheDocument();
  });

  it("clicking Back tab shows Back exercises", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("tab-back"));
    expect(screen.getByText("Pull Ups")).toBeInTheDocument();
  });
});

// ─── Archive tab ──────────────────────────────────────────────────────────────

describe("archive tab", () => {
  it("shows the Archive tab when at least one exercise is archived", () => {
    const ex = createExercise(makeExercise());
    updateExercise(ex.id, { archived: true });
    renderApp();
    expect(screen.getByTestId("tab-archive")).toBeInTheDocument();
  });

  it("shows archived exercises on the Archive tab", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Retired Move" }));
    updateExercise(ex.id, { archived: true });
    renderApp();
    await user.click(screen.getByTestId("tab-archive"));
    expect(screen.getByText("Retired Move")).toBeInTheDocument();
  });

  it("does not show the Archive tab when no exercises are archived", () => {
    renderApp();
    // All default exercises are non-archived, so Archive tab is hidden
    expect(screen.queryByTestId("tab-archive")).not.toBeInTheDocument();
  });
});

// ─── Session lifecycle ────────────────────────────────────────────────────────

describe("session lifecycle", () => {
  it("clicking Start Workout starts a session and shows End button", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    expect(screen.getByTestId("btn-end-session")).toBeInTheDocument();
  });

  it("a new active session is recorded in storage", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    expect(getActiveSession()).not.toBeNull();
  });

  it("clicking End opens the confirmation dialog", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("btn-end-session"));
    expect(screen.getByTestId("btn-end-confirm")).toBeInTheDocument();
  });

  it("confirming End closes the session and shows the summary", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("btn-end-session"));
    await user.click(screen.getByTestId("btn-end-confirm"));
    expect(screen.getByTestId("summary-sheet")).toBeInTheDocument();
  });

  it("cancelling End returns to the active session", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("btn-end-session"));
    await user.click(screen.getByTestId("btn-end-cancel"));
    expect(screen.getByTestId("btn-end-session")).toBeInTheDocument();
  });

  it("closing the summary shows the Start Workout button again", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("btn-end-session"));
    await user.click(screen.getByTestId("btn-end-confirm"));
    await user.click(screen.getByTestId("summary-close"));
    expect(screen.getByTestId("btn-start-session")).toBeInTheDocument();
  });
});

// ─── Rep logging ──────────────────────────────────────────────────────────────

describe("rep logging", () => {
  it("clicking a rep square during a session marks it as done", async () => {
    const user = userEvent.setup();
    renderApp();
    // Navigate to Back tab where Pull Ups lives
    await user.click(screen.getByTestId("tab-back"));
    await user.click(screen.getByTestId("btn-start-session"));

    // Click rep square 8 on the first rep bar
    const repBars = screen.getAllByTestId("rep-bar");
    const firstBar = repBars[0];
    await user.click(within(firstBar).getByTestId("rep-square-8"));

    // Session counter should show 1 exercise done
    expect(screen.getByTestId("session-counter")).toHaveTextContent("1");
  });
});

// ─── Add exercise ─────────────────────────────────────────────────────────────

describe("add exercise", () => {
  it("shows the Add Exercise button", () => {
    renderApp();
    expect(screen.getByTestId("btn-add-exercise")).toBeInTheDocument();
  });

  it("clicking Add Exercise opens the sheet", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-exercise"));
    expect(screen.getByTestId("edit-sheet")).toBeInTheDocument();
  });

  it("filling in the form and saving creates a new exercise", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-exercise"));
    await user.clear(screen.getByTestId("edit-name"));
    await user.type(screen.getByTestId("edit-name"), "My Custom Lift");
    await user.click(screen.getByTestId("edit-save"));
    expect(screen.getByText("My Custom Lift")).toBeInTheDocument();
  });
});

// ─── Reset to defaults ────────────────────────────────────────────────────────

describe("reset to defaults", () => {
  it("shows the Reset button in the page", () => {
    renderApp();
    expect(screen.getByText(/reset exercises to defaults/i)).toBeInTheDocument();
  });

  it("clicking Reset shows a confirmation prompt", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByText(/reset exercises to defaults/i));
    // Confirmation heading appears
    expect(screen.getByText(/reset exercises\?/i)).toBeInTheDocument();
  });
});

// ─── Export modal ─────────────────────────────────────────────────────────────

describe("export modal", () => {
  it("clicking Export opens the export modal", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-export"));
    expect(screen.getByText(/export exercises/i)).toBeInTheDocument();
  });

  it("the modal has Download as file and Copy transfer code buttons", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-export"));
    expect(screen.getByText(/download as file/i)).toBeInTheDocument();
    expect(screen.getByText(/copy transfer code/i)).toBeInTheDocument();
  });
});

// ─── Exercise ordering / drag-to-reorder ─────────────────────────────────────

describe("exercise ordering", () => {
  it("renders exercises sorted by sortOrder within a category", () => {
    // Create exercises out of insertion order — the UI must sort by sortOrder
    createExercise(makeExercise({ name: "Second", sortOrder: 1 }));
    createExercise(makeExercise({ name: "Third",  sortOrder: 2 }));
    createExercise(makeExercise({ name: "First",  sortOrder: 0 }));
    renderApp();
    const names = screen.getAllByTestId("exercise-name").map((el) => el.textContent);
    expect(names[0]).toBe("First");
    expect(names[1]).toBe("Second");
    expect(names[2]).toBe("Third");
  });

  it("a new exercise receives a sortOrder one above the current max for its category", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Existing A", category: "Back", sortOrder: 0 }));
    createExercise(makeExercise({ name: "Existing B", category: "Back", sortOrder: 1 }));
    renderApp();

    await user.click(screen.getByTestId("btn-add-exercise"));
    await user.clear(screen.getByTestId("edit-name"));
    await user.type(screen.getByTestId("edit-name"), "Newcomer");
    await user.click(screen.getByTestId("edit-save"));

    const newcomer = getExercises().find((e) => e.name === "Newcomer");
    expect(newcomer?.sortOrder).toBe(2);
  });

  it("a new exercise appears last in the rendered list for its category", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Alpha", category: "Back", sortOrder: 0 }));
    createExercise(makeExercise({ name: "Beta",  category: "Back", sortOrder: 1 }));
    renderApp();

    await user.click(screen.getByTestId("btn-add-exercise"));
    await user.clear(screen.getByTestId("edit-name"));
    await user.type(screen.getByTestId("edit-name"), "Omega");
    await user.click(screen.getByTestId("edit-save"));

    const names = screen.getAllByTestId("exercise-name").map((el) => el.textContent);
    expect(names[names.length - 1]).toBe("Omega");
  });

  it("after saveExercisesOrder the component reflects the new display order", () => {
    const a = createExercise(makeExercise({ name: "Alpha", sortOrder: 0 }));
    const b = createExercise(makeExercise({ name: "Beta",  sortOrder: 1 }));
    const c = createExercise(makeExercise({ name: "Gamma", sortOrder: 2 }));

    // Move Gamma to position 0 before the component ever mounts
    saveExercisesOrder([c.id, a.id, b.id]);

    renderApp();

    const names = screen.getAllByTestId("exercise-name").map((el) => el.textContent);
    expect(names[0]).toBe("Gamma");
    expect(names[1]).toBe("Alpha");
    expect(names[2]).toBe("Beta");
  });

  it("exercise cards are wrapped in the no-select sortable class (prevents iOS text callout)", () => {
    createExercise(makeExercise());
    renderApp();
    expect(document.querySelector(".exercise-sortable")).toBeInTheDocument();
  });

  it("archive tab exercises are not wrapped in the sortable class", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Old Move" }));
    updateExercise(ex.id, { archived: true });
    renderApp();
    await user.click(screen.getByTestId("tab-archive"));
    // Archived exercises render via plain ExerciseCard without the sortable wrapper
    expect(document.querySelector(".exercise-sortable")).not.toBeInTheDocument();
  });
});
