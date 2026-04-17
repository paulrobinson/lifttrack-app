import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiftTracker from "./LiftTracker";
import { createExercise, updateExercise, getExercises, getActiveSession, saveExercisesOrder, getCategories, saveCategories, startSession, endSession, logSet, archiveSession, getSessions, getSessionSets, getAllSessionSets, saveSettings, deleteSessionSetById } from "@/lib/storage";
import { generateLogText, type HistorySessionEntry } from "@/components/SessionHistory";

// Mock scrollIntoView for tests (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExercise(overrides = {}) {
  return {
    name: "Pull Ups",
    category: "Upper",
    weight: 0,
    maxReps: 12,
    sets: 3,
    lastReps: 8,
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

  it("shows sets count as a labeled value like '3 sets'", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3 }));
    renderApp();
    const card = screen.getByTestId("exercise-card-1");
    expect(within(card).getByText("3 sets")).toBeInTheDocument();
  });

  it("shows singular 'set' label when exercise has 1 set", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 1 }));
    renderApp();
    const card = screen.getByTestId("exercise-card-1");
    expect(within(card).getByText("1 set")).toBeInTheDocument();
  });
});

// ─── Tab navigation ───────────────────────────────────────────────────────────

describe("tab navigation", () => {
  it("renders category tabs for each category that has exercises", () => {
    renderApp();
    expect(screen.getByTestId("tab-upper")).toBeInTheDocument();
    expect(screen.getByTestId("tab-lower")).toBeInTheDocument();
  });

  it("clicking a different tab shows exercises from that category", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("tab-lower"));
    expect(screen.getByText("Back Squat")).toBeInTheDocument();
  });

  it("clicking Upper tab shows Upper exercises", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    expect(screen.getByText("Pull Ups")).toBeInTheDocument();
  });
});

// ─── Retired tab ──────────────────────────────────────────────────────────────

describe("retired tab", () => {
  it("shows the Retired tab when at least one exercise is retired", () => {
    const ex = createExercise(makeExercise());
    updateExercise(ex.id, { archived: true });
    renderApp();
    expect(screen.getByTestId("tab-retired")).toBeInTheDocument();
  });

  it("shows retired exercises on the Retired tab", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Retired Move" }));
    updateExercise(ex.id, { archived: true });
    renderApp();
    await user.click(screen.getByTestId("tab-retired"));
    expect(screen.getByText("Retired Move")).toBeInTheDocument();
  });

  it("does not show the Retired tab when no exercises are retired", () => {
    renderApp();
    // All default exercises are not retired, so Retired tab is hidden
    expect(screen.queryByTestId("tab-retired")).not.toBeInTheDocument();
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
    // Navigate to Upper tab where Pull Ups lives
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-start-session"));

    // Click rep square 6 on the first rep bar (below maxReps to avoid weight prompt)
    const repBars = screen.getAllByTestId("rep-bar");
    const firstBar = repBars[0];
    await user.click(within(firstBar).getByTestId("rep-square-6"));

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

  it("shows toast notification after adding an exercise", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-exercise"));
    await user.clear(screen.getByTestId("edit-name"));
    await user.type(screen.getByTestId("edit-name"), "Bench Press");
    await user.click(screen.getByTestId("edit-save"));
    await waitFor(() => {
      expect(screen.getByText(/Bench Press added to/i)).toBeInTheDocument();
    });
  });

  it("highlights newly added exercise with green flash animation", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-exercise"));
    await user.clear(screen.getByTestId("edit-name"));
    await user.type(screen.getByTestId("edit-name"), "Deadlift");
    await user.click(screen.getByTestId("edit-save"));

    // Find the newly added exercise
    const newExercise = getExercises().find((e) => e.name === "Deadlift");
    expect(newExercise).toBeDefined();

    // Check that the exercise card has the drop-confirm animation class
    await waitFor(() => {
      const exerciseElement = document.querySelector(`[data-exercise-id="${newExercise!.id}"]`);
      expect(exerciseElement).toBeInTheDocument();
      const animatedDiv = exerciseElement?.querySelector(".exercise-drop-confirm");
      expect(animatedDiv).toBeInTheDocument();
    });
  });

  it("scrolls to newly added exercise", async () => {
    const user = userEvent.setup();
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    renderApp();
    await user.click(screen.getByTestId("btn-add-exercise"));
    await user.clear(screen.getByTestId("edit-name"));
    await user.type(screen.getByTestId("edit-name"), "Squat");
    await user.click(screen.getByTestId("edit-save"));

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    // Verify it was called with the correct options
    expect(scrollIntoViewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: "smooth",
        block: "center",
      })
    );
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
    createExercise(makeExercise({ name: "Existing A", category: "Upper", sortOrder: 0 }));
    createExercise(makeExercise({ name: "Existing B", category: "Upper", sortOrder: 1 }));
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
    createExercise(makeExercise({ name: "Alpha", category: "Upper", sortOrder: 0 }));
    createExercise(makeExercise({ name: "Beta",  category: "Upper", sortOrder: 1 }));
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

  it("retired tab exercises are not wrapped in the sortable class", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Old Move" }));
    updateExercise(ex.id, { archived: true });
    renderApp();
    await user.click(screen.getByTestId("tab-retired"));
    // Retired exercises render via plain ExerciseCard without the sortable wrapper
    expect(document.querySelector(".exercise-sortable")).not.toBeInTheDocument();
  });
});

// ─── Custom categories ────────────────────────────────────────────────────────

describe("custom categories", () => {
  it("renders the add-category '+' button in the tab bar", () => {
    renderApp();
    expect(screen.getByTestId("btn-add-category")).toBeInTheDocument();
  });

  it("clicking '+' opens the add-category dialog", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-category"));
    expect(screen.getByTestId("add-category-input")).toBeInTheDocument();
  });

  it("cancel button closes the dialog without adding a category", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-category"));
    await user.click(screen.getByTestId("add-category-cancel"));
    expect(screen.queryByTestId("add-category-input")).not.toBeInTheDocument();
  });

  it("submitting a new category name adds a tab and persists it", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-category"));
    await user.type(screen.getByTestId("add-category-input"), "Cardio");
    await user.click(screen.getByTestId("add-category-confirm"));
    // Dialog closes
    expect(screen.queryByTestId("add-category-input")).not.toBeInTheDocument();
    // New tab is visible
    expect(screen.getByTestId("tab-cardio")).toBeInTheDocument();
    // Persisted in storage
    expect(getCategories()).toContain("Cardio");
  });

  it("pressing Enter in the input confirms the dialog", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-category"));
    await user.type(screen.getByTestId("add-category-input"), "Mobility{Enter}");
    expect(screen.queryByTestId("add-category-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("tab-mobility")).toBeInTheDocument();
  });

  it("shows an error when the name is empty", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-category"));
    await user.click(screen.getByTestId("add-category-confirm"));
    expect(screen.getByTestId("add-category-error")).toBeInTheDocument();
  });

  it("shows an error when the category already exists (case-insensitive)", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-category"));
    await user.type(screen.getByTestId("add-category-input"), "upper");
    await user.click(screen.getByTestId("add-category-confirm"));
    expect(screen.getByTestId("add-category-error")).toBeInTheDocument();
  });

  it("the exercise edit sheet shows custom categories in the group dropdown", async () => {
    const user = userEvent.setup();
    // Pre-seed a custom category
    saveCategories(["Upper", "Lower", "Aquatics"]);
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-edit"));
    const select = screen.getByTestId("edit-category") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("Aquatics");
  });

  it("pre-existing custom category tabs appear when the app starts", () => {
    saveCategories(["Back", "Chest", "Upper", "Legs", "CrossFit"]);
    createExercise(makeExercise({ name: "Box Jump", category: "CrossFit" }));
    renderApp();
    expect(screen.getByTestId("tab-crossfit")).toBeInTheDocument();
  });

  it("navigating to a new category tab shows the empty-state message", async () => {
    const user = userEvent.setup();
    saveCategories(["Back", "Chest", "Upper", "Legs", "Stretching"]);
    renderApp();
    await user.click(screen.getByTestId("tab-stretching"));
    expect(screen.getByText(/No exercises in Stretching yet/)).toBeInTheDocument();
  });

  it("after adding a category, new exercise defaults to that category in the sheet", async () => {
    const user = userEvent.setup();
    renderApp();
    // Add "Yoga" category
    await user.click(screen.getByTestId("btn-add-category"));
    await user.type(screen.getByTestId("add-category-input"), "Yoga");
    await user.click(screen.getByTestId("add-category-confirm"));
    // Now open the add exercise sheet (we should be on the Yoga tab)
    await user.click(screen.getByTestId("btn-add-exercise"));
    const select = screen.getByTestId("edit-category") as HTMLSelectElement;
    // Yoga tab should be selected and available
    expect(select.value).toBe("Yoga");
  });
});

// ─── Remove group ─────────────────────────────────────────────────────────────

describe("remove group", () => {
  it("does not show the remove button on a tab that has exercises", () => {
    renderApp();
    // Back tab has exercises (seeded), no remove button should appear
    expect(screen.queryByTestId("btn-remove-group")).not.toBeInTheDocument();
  });

  it("shows the remove button on an empty tab", async () => {
    const user = userEvent.setup();
    saveCategories(["Back", "Chest", "Upper", "Legs", "Empty"]);
    renderApp();
    await user.click(screen.getByTestId("tab-empty"));
    expect(screen.getByTestId("btn-remove-group")).toBeInTheDocument();
  });

  it("clicking remove group shows the confirmation UI", async () => {
    const user = userEvent.setup();
    saveCategories(["Back", "Chest", "Upper", "Legs", "Empty"]);
    renderApp();
    await user.click(screen.getByTestId("tab-empty"));
    await user.click(screen.getByTestId("btn-remove-group"));
    expect(screen.getByTestId("btn-remove-group-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("btn-remove-group-cancel")).toBeInTheDocument();
  });

  it("clicking cancel hides the confirmation", async () => {
    const user = userEvent.setup();
    saveCategories(["Back", "Chest", "Upper", "Legs", "Empty"]);
    renderApp();
    await user.click(screen.getByTestId("tab-empty"));
    await user.click(screen.getByTestId("btn-remove-group"));
    await user.click(screen.getByTestId("btn-remove-group-cancel"));
    expect(screen.queryByTestId("btn-remove-group-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-remove-group")).toBeInTheDocument();
  });

  it("confirming removes the group tab", async () => {
    const user = userEvent.setup();
    saveCategories(["Back", "Chest", "Upper", "Legs", "Empty"]);
    renderApp();
    await user.click(screen.getByTestId("tab-empty"));
    await user.click(screen.getByTestId("btn-remove-group"));
    await user.click(screen.getByTestId("btn-remove-group-confirm"));
    expect(screen.queryByTestId("tab-empty")).not.toBeInTheDocument();
    expect(getCategories()).not.toContain("Empty");
  });

  it("switching tabs resets the confirmation state", async () => {
    const user = userEvent.setup();
    saveCategories(["Back", "Chest", "Upper", "Legs", "Empty"]);
    renderApp();
    await user.click(screen.getByTestId("tab-empty"));
    await user.click(screen.getByTestId("btn-remove-group"));
    expect(screen.getByTestId("btn-remove-group-confirm")).toBeInTheDocument();
    // Switch away and back
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("tab-empty"));
    expect(screen.queryByTestId("btn-remove-group-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-remove-group")).toBeInTheDocument();
  });

  it("does not show the remove button on the Retired tab", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Old Move" }));
    updateExercise(ex.id, { archived: true });
    renderApp();
    await user.click(screen.getByTestId("tab-retired"));
    expect(screen.queryByTestId("btn-remove-group")).not.toBeInTheDocument();
  });
});

// ─── Settings panel ───────────────────────────────────────────────────────────

describe("settings panel", () => {
  it("renders a settings button (cog icon) in the header", () => {
    renderApp();
    expect(screen.getByTestId("btn-open-settings")).toBeInTheDocument();
  });

  it("clicking the settings button opens the settings panel", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
  });

  it("the settings panel contains the 'Show sets as separate bars' toggle", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    expect(screen.getByTestId("toggle-separate-bars")).toBeInTheDocument();
  });

  it("the toggle starts off (aria-checked=false) by default", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    const toggle = screen.getByTestId("toggle-separate-bars");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("clicking the toggle switches it to on", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    const toggle = screen.getByTestId("toggle-separate-bars");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("clicking the toggle twice returns it to off", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    const toggle = screen.getByTestId("toggle-separate-bars");
    await user.click(toggle);
    await user.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("closing the settings panel via the × button hides the panel", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("settings-close"));
    expect(screen.queryByTestId("settings-panel")).not.toBeInTheDocument();
  });

  it("clicking the overlay backdrop closes the settings panel", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("settings-overlay"));
    expect(screen.queryByTestId("settings-panel")).not.toBeInTheDocument();
  });
});

// ─── Weight unit setting ─────────────────────────────────────────────────────

describe("weight unit setting", () => {
  it("shows a weight unit toggle in the settings panel", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    expect(screen.getByTestId("toggle-weight-unit")).toBeInTheDocument();
  });

  it("weight unit defaults to kg", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    expect(screen.getByTestId("toggle-weight-unit")).toHaveTextContent("kg");
  });

  it("clicking the toggle switches to lbs", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    const toggle = screen.getByTestId("toggle-weight-unit");
    await user.click(toggle);
    expect(toggle).toHaveTextContent("lbs");
  });

  it("clicking the toggle twice returns to kg", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-settings"));
    const toggle = screen.getByTestId("toggle-weight-unit");
    await user.click(toggle);
    await user.click(toggle);
    expect(toggle).toHaveTextContent("kg");
  });

  it("exercise cards display weight with kg by default", () => {
    createExercise(makeExercise({ name: "Test Exercise", category: "Upper", weight: 30 }));
    renderApp();
    const card = screen.getByTestId("exercise-card-" + getExercises().find(e => e.name === "Test Exercise")!.id);
    expect(within(card).getByTestId("exercise-weight")).toHaveTextContent("30kg");
  });

  it("exercise cards display weight with lbs when setting is lbs", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Test Exercise", category: "Upper", weight: 30 }));
    saveSettings({ showSeparateBars: false, weightUnit: "lbs" });
    renderApp();
    const card = screen.getByTestId("exercise-card-" + getExercises().find(e => e.name === "Test Exercise")!.id);
    expect(within(card).getByTestId("exercise-weight")).toHaveTextContent("30lbs");
  });

  it("weight prompt shows the configured unit label", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Test Exercise", category: "Upper", weight: 30, maxReps: 12, lastReps: 8 }));
    saveSettings({ showSeparateBars: false, weightUnit: "lbs" });
    renderApp();

    // Start a session
    await user.click(screen.getByTestId("btn-start-session"));

    // Tap max reps to trigger the weight prompt
    const ex = getExercises().find(e => e.name === "Test Exercise")!;
    const card = screen.getByTestId(`exercise-card-${ex.id}`);
    const maxRepSquare = within(card).getByTestId(`rep-square-12`);
    await user.click(maxRepSquare);

    await waitFor(() => {
      expect(screen.getByTestId("weight-prompt")).toBeInTheDocument();
    });

    // The prompt should show "lbs" not "kg"
    const prompt = screen.getByTestId("weight-prompt");
    expect(prompt).toHaveTextContent("lbs");
    expect(prompt).not.toHaveTextContent("kg");
  });

  it("edit exercise sheet shows weight unit label matching setting", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Test Exercise", category: "Upper", weight: 30 }));
    saveSettings({ showSeparateBars: false, weightUnit: "lbs" });
    renderApp();

    const ex = getExercises().find(e => e.name === "Test Exercise")!;
    const card = screen.getByTestId(`exercise-card-${ex.id}`);
    await user.click(within(card).getByTestId("btn-edit"));
    const sheet = screen.getByTestId("edit-sheet");
    expect(sheet).toHaveTextContent("Weight (lbs)");
  });

  it("generateLogText uses lbs when specified", () => {
    const entries: HistorySessionEntry[] = [{
      session: { id: 1, startedAt: "2026-04-14T10:00:00.000Z", endedAt: "2026-04-14T10:45:00.000Z" },
      exercises: [
        { exerciseId: 1, exerciseName: "Bench Press", category: "Chest", weight: 135, repsAchieved: 8, prevLastReps: 8, weightIncreased: false },
      ],
    }];
    const text = generateLogText(entries, "lbs");
    expect(text).toContain("135lbs × 8");
    expect(text).not.toContain("kg");
  });

  it("generateLogText defaults to kg", () => {
    const entries: HistorySessionEntry[] = [{
      session: { id: 1, startedAt: "2026-04-14T10:00:00.000Z", endedAt: "2026-04-14T10:45:00.000Z" },
      exercises: [
        { exerciseId: 1, exerciseName: "Bench Press", category: "Chest", weight: 60, repsAchieved: 8, prevLastReps: 8, weightIncreased: false },
      ],
    }];
    const text = generateLogText(entries);
    expect(text).toContain("60kg × 8");
  });

  it("persists the weight unit setting across re-renders", async () => {
    const user = userEvent.setup();
    renderApp();

    // Set to lbs
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-weight-unit"));
    expect(screen.getByTestId("toggle-weight-unit")).toHaveTextContent("lbs");
    await user.click(screen.getByTestId("settings-close"));

    // Re-open settings — should still be lbs
    await user.click(screen.getByTestId("btn-open-settings"));
    expect(screen.getByTestId("toggle-weight-unit")).toHaveTextContent("lbs");
  });
});

// ─── Separate bars mode ───────────────────────────────────────────────────────

describe("separate bars mode", () => {
  it("shows a single rep-bar per exercise when the setting is off (default)", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, lastReps: 8 }));
    renderApp();
    // In single-bar mode there should be exactly one rep-bar per exercise shown
    // (the default seeded exercises are also rendered; just check no rep-bar-multi)
    expect(screen.queryByTestId("rep-bar-multi")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("rep-bar").length).toBeGreaterThan(0);
  });

  it("shows rep-bar-multi containers when the separate bars setting is on", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, lastReps: 8 }));
    renderApp();

    // Enable separate bars
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    expect(screen.getAllByTestId("rep-bar-multi").length).toBeGreaterThan(0);
  });

  it("renders one bar row per set when separate bars is on", async () => {
    const user = userEvent.setup();
    // 3 sets, no lastRepsSets → should show 3 bar rows
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    // Each rep-bar-multi container should have 3 children (rep-bar-set-0, -1, -2)
    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];
    expect(within(pullUpsContainer).getAllByTestId(/^rep-bar-set-/).length).toBe(3);
  });

  it("renders one bar per lastRepsSets entry when per-set data is present", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({
      name: "Pull Ups",
      category: "Upper",
      sets: 4,
      lastReps: 10,
      lastRepsSets: [10, 10, 10, 9],
    }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];
    // lastRepsSets has 4 entries → 4 bars
    expect(within(pullUpsContainer).getAllByTestId(/^rep-bar-set-/).length).toBe(4);
  });

  it("each bar is independent: tapping bar 0 does not affect bar 1", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    // Enable separate bars
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    // Start session
    await user.click(screen.getByTestId("btn-start-session"));

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];

    // Tap rep 8 on bar 0 only
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-0-8"));

    // Bar 0 square 8 should now be filled (green), bar 1 square 8 should still be reference (not filled)
    const bar0Sq8 = within(pullUpsContainer).getByTestId("rep-square-set-0-8");
    const bar1Sq8 = within(pullUpsContainer).getByTestId("rep-square-set-1-8");
    expect(bar0Sq8.className).toContain("filled");
    expect(bar1Sq8.className).not.toContain("filled");
  });

  it("exercise is NOT marked done when only some sets are logged", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];

    // Only tap bar 0
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-0-8"));

    // done-check should NOT be present yet (exercise not complete)
    expect(screen.queryByTestId("done-check")).not.toBeInTheDocument();
  });

  it("exercise IS marked done when all sets are logged", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];

    // Tap all 3 bars
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-0-8"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-1-8"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-2-8"));

    expect(screen.getByTestId("done-check")).toBeInTheDocument();
  });

  it("session counter increments only when all sets are logged in multi mode", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));

    // Counter starts at 0
    expect(screen.getByTestId("session-counter").textContent).toContain("0");

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];

    // Log first two sets — counter should still be 0 (not complete)
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-0-8"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-1-8"));
    expect(screen.getByTestId("session-counter").textContent).toContain("0");

    // Log final set — now counter should be 1
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-2-8"));
    expect(screen.getByTestId("session-counter").textContent).toContain("1");
  });

  it("tapping a logged bar reverts it (last bar logged)", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];

    // Log bar 0 and bar 1
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-0-8"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-1-8"));

    // Undo bar 1 by tapping its undo wrapper
    await user.click(screen.getByTestId("rep-bar-undo-set-1"));

    // Bar 1 should now be unlogged (not filled), bar 0 still filled
    const bar0Sq8 = within(pullUpsContainer).getByTestId("rep-square-set-0-8");
    const bar1Sq8 = within(pullUpsContainer).getByTestId("rep-square-set-1-8");
    expect(bar0Sq8.className).toContain("filled");
    expect(bar1Sq8.className).not.toContain("filled");
  });

  it("tapping a non-last logged bar reverts only that bar", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];

    // Log bar 0 then bar 1
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-0-8"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-1-8"));

    // Undo bar 0 (NOT the last logged bar)
    await user.click(screen.getByTestId("rep-bar-undo-set-0"));

    // Bar 0 should be unlogged, bar 1 should still be filled
    const bar0Sq8 = within(pullUpsContainer).getByTestId("rep-square-set-0-8");
    const bar1Sq8 = within(pullUpsContainer).getByTestId("rep-square-set-1-8");
    expect(bar0Sq8.className).not.toContain("filled");
    expect(bar1Sq8.className).toContain("filled");
  });

  it("up badge shows when total reps logged exceeds previous total", async () => {
    const user = userEvent.setup();
    // lastReps=8, sets=3 → prev total=24; logging 9+9+9=27 should be Up
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];

    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-0-9"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-1-9"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-2-9"));

    expect(screen.getByTestId("badge-up")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-down")).not.toBeInTheDocument();
  });

  it("down badge shows when total reps logged is less than previous total", async () => {
    const user = userEvent.setup();
    // lastReps=8, sets=3 → prev total=24; logging 7+7+7=21 should be Down
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];

    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-0-7"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-1-7"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-2-7"));

    expect(screen.getByTestId("badge-down")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-up")).not.toBeInTheDocument();
  });

  it("no up/down badge when total reps equal previous total", async () => {
    const user = userEvent.setup();
    // lastReps=8, sets=3 → prev total=24; logging 8+8+8=24 → neither Up nor Down
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));

    const multiContainers = screen.getAllByTestId("rep-bar-multi");
    const pullUpsContainer = multiContainers[0];

    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-0-8"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-1-8"));
    await user.click(within(pullUpsContainer).getByTestId("rep-square-set-2-8"));

    expect(screen.queryByTestId("badge-up")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-down")).not.toBeInTheDocument();
  });

  it("shows last-trend badge from previous session when no session is active", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", lastTrend: "up" }));
    renderApp();

    expect(screen.getByTestId("badge-last-up")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-last-down")).not.toBeInTheDocument();
  });

  it("shows last-trend down badge when previous session had a decline", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", lastTrend: "down" }));
    renderApp();

    expect(screen.getByTestId("badge-last-down")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-last-up")).not.toBeInTheDocument();
  });

  it("hides last-trend badge once exercise is logged in current session", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", lastTrend: "up", lastReps: 8 }));
    renderApp();

    expect(screen.getByTestId("badge-last-up")).toBeInTheDocument();

    await user.click(screen.getByTestId("btn-start-session"));
    // lastTrend badge still visible before logging
    expect(screen.getByTestId("badge-last-up")).toBeInTheDocument();

    // Log reps (9 > 8 = up)
    await user.click(screen.getByTestId("rep-square-9"));

    // Now the live badge should show, last-trend badge should be gone
    expect(screen.getByTestId("badge-up")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-last-up")).not.toBeInTheDocument();
  });

  it("restores last-trend badge after undo", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", lastTrend: "down", lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-start-session"));
    expect(screen.getByTestId("badge-last-down")).toBeInTheDocument();

    // Log reps (9 > 8 = up)
    await user.click(screen.getByTestId("rep-square-9"));
    expect(screen.getByTestId("badge-up")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-last-down")).not.toBeInTheDocument();

    // Undo — tap the bar
    await user.click(screen.getByTestId("rep-bar"));

    // Last-trend badge should be restored
    expect(screen.getByTestId("badge-last-down")).toBeInTheDocument();
    expect(screen.queryByTestId("badge-up")).not.toBeInTheDocument();
  });

  it("no last-trend badge when lastTrend is not set", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();

    expect(screen.queryByTestId("badge-last-up")).not.toBeInTheDocument();
    expect(screen.queryByTestId("badge-last-down")).not.toBeInTheDocument();
  });
});

// ─── Session log panel ────────────────────────────────────────────────────────

describe("session log panel", () => {
  it("opens when the log button is clicked and closes on backdrop click", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.queryByTestId("session-history-panel")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("btn-open-log"));
    expect(screen.getByTestId("session-history-panel")).toBeInTheDocument();
    await user.click(screen.getByTestId("history-overlay"));
    expect(screen.queryByTestId("session-history-panel")).not.toBeInTheDocument();
  });

  it("shows empty state when there are no completed sessions", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    expect(screen.getByTestId("session-log-empty")).toBeInTheDocument();
  });

  it("shows a completed session card in the log", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Bench Press" }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 60, repsAchieved: 8 });
    endSession(session.id);
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    const panel = screen.getByTestId("session-history-panel");
    expect(screen.queryByTestId("session-log-empty")).not.toBeInTheDocument();
    expect(within(panel).getByText("Bench Press")).toBeInTheDocument();
  });

  it("does not show an in-progress session in the log", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Deadlift" }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 80, repsAchieved: 5 });
    // session not ended
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    expect(screen.getByTestId("session-log-empty")).toBeInTheDocument();
  });

  it("archive button moves session out of active log view", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups" }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 0, repsAchieved: 10 });
    endSession(session.id);
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    await user.click(screen.getByTestId(`btn-archive-session-${session.id}`));
    expect(screen.getByTestId("session-log-empty")).toBeInTheDocument();
  });

  it("archived session appears in archive view", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Squat" }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 60, repsAchieved: 6 });
    endSession(session.id);
    archiveSession(session.id);
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    await user.click(screen.getByTestId("btn-view-archived"));
    expect(within(screen.getByTestId("session-history-panel")).getByText("Squat")).toBeInTheDocument();
  });

  it("un-archiving a session moves it back to active log", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Overhead Press" }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 40, repsAchieved: 8 });
    endSession(session.id);
    archiveSession(session.id);
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    await user.click(screen.getByTestId("btn-view-archived"));
    await user.click(screen.getByTestId(`btn-unarchive-session-${session.id}`));
    // Now in active view
    expect(within(screen.getByTestId("session-history-panel")).getByText("Overhead Press")).toBeInTheDocument();
  });

  it("deleting from archive view removes the session entirely", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Leg Press" }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 100, repsAchieved: 10 });
    endSession(session.id);
    archiveSession(session.id);
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    await user.click(screen.getByTestId("btn-view-archived"));
    await user.click(screen.getByTestId(`btn-delete-session-${session.id}`));
    await user.click(screen.getByTestId(`btn-delete-session-confirm-${session.id}`));
    expect(getSessions().find((s) => s.id === session.id)).toBeUndefined();
  });

  it("deleting from archive does not change exercise lastReps", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Curl", lastReps: 5 }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 20, repsAchieved: 12 });
    endSession(session.id);
    archiveSession(session.id);
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    await user.click(screen.getByTestId("btn-view-archived"));
    await user.click(screen.getByTestId(`btn-delete-session-${session.id}`));
    await user.click(screen.getByTestId(`btn-delete-session-confirm-${session.id}`));
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.lastReps).toBe(12);
  });
});

// ─── Download log ────────────────────────────────────────────────────────────

describe("download log", () => {
  it("download button appears when there are completed sessions", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Bench Press" }));
    const session = startSession();
    logSet({ sessionId: session.id, exerciseId: ex.id, weight: 60, repsAchieved: 8 });
    endSession(session.id);
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    expect(screen.getByTestId("btn-download-log")).toBeInTheDocument();
  });

  it("download button is hidden when there are no completed sessions", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-open-log"));
    expect(screen.queryByTestId("btn-download-log")).not.toBeInTheDocument();
  });

  it("generateLogText returns empty message for no entries", () => {
    expect(generateLogText([])).toBe("No completed sessions.");
  });

  it("generateLogText formats a session with exercises", () => {
    const entries: HistorySessionEntry[] = [{
      session: { id: 1, startedAt: "2026-04-14T10:00:00.000Z", endedAt: "2026-04-14T10:45:00.000Z" },
      exercises: [
        { exerciseId: 1, exerciseName: "Pull Ups", category: "Upper", weight: 0, repsAchieved: 10, prevLastReps: 8, weightIncreased: false },
        { exerciseId: 2, exerciseName: "DB Row", category: "Upper", weight: 28, repsAchieved: 7, prevLastReps: 8, weightIncreased: false },
      ],
    }];
    const text = generateLogText(entries);
    expect(text).toContain("Exercise Log");
    expect(text).toContain("Pull Ups");
    expect(text).toContain("0kg × 10 ↑");
    expect(text).toContain("28kg × 7 ↓");
    expect(text).toContain("2 exercises");
    expect(text).toContain("All Upper");
  });

  it("generateLogText shows weight increase note", () => {
    const entries: HistorySessionEntry[] = [{
      session: { id: 1, startedAt: "2026-04-14T10:00:00.000Z", endedAt: "2026-04-14T10:30:00.000Z" },
      exercises: [
        { exerciseId: 1, exerciseName: "Bench Press", category: "Chest", weight: 65, repsAchieved: 8, prevLastReps: 8, weightIncreased: true },
      ],
    }];
    const text = generateLogText(entries);
    expect(text).toContain("(↑wt)");
  });

  it("generateLogText shows no trend when reps unchanged", () => {
    const entries: HistorySessionEntry[] = [{
      session: { id: 1, startedAt: "2026-04-14T10:00:00.000Z", endedAt: "2026-04-14T10:30:00.000Z" },
      exercises: [
        { exerciseId: 1, exerciseName: "Cable Row", category: "Upper", weight: 50, repsAchieved: 8, prevLastReps: 8, weightIncreased: false },
      ],
    }];
    const text = generateLogText(entries);
    expect(text).toContain("50kg × 8");
    expect(text).not.toContain("↑");
    expect(text).not.toContain("↓");
  });
});

// ─── Single-bar mode: unified storage model ───────────────────────────────────

describe("single-bar mode: per-set storage", () => {
  it("logging in single mode creates one SessionSet per exercise set", async () => {
    const user = userEvent.setup();
    // sets=3, single-bar mode (default)
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-start-session"));

    const repBars = screen.getAllByTestId("rep-bar");
    await user.click(within(repBars[0]).getByTestId("rep-square-9"));

    const session = getActiveSession()!;
    const sets = getSessionSets(session.id);
    // Expect 3 SessionSets (one per set), not 1
    expect(sets.filter((s) => s.repsAchieved === 9)).toHaveLength(3);
  });

  it("all created SessionSets have the same repsAchieved value", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-start-session"));

    const repBars = screen.getAllByTestId("rep-bar");
    await user.click(within(repBars[0]).getByTestId("rep-square-7"));

    const session = getActiveSession()!;
    const sets = getSessionSets(session.id);
    expect(sets.every((s) => s.repsAchieved === 7)).toBe(true);
  });

  it("exercise.lastRepsSets is populated after single-mode logging", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-start-session"));

    const repBars = screen.getAllByTestId("rep-bar");
    await user.click(within(repBars[0]).getByTestId("rep-square-9"));

    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastRepsSets).toEqual([9, 9, 9]);
  });

  it("undo in single mode removes all N created SessionSets", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-start-session"));

    const repBars = screen.getAllByTestId("rep-bar");
    await user.click(within(repBars[0]).getByTestId("rep-square-9"));

    // Tap bar again to undo (inline undo div)
    const undoBar = screen.getAllByTestId("rep-bar")[0];
    await user.click(undoBar);

    const session = getActiveSession()!;
    expect(getSessionSets(session.id)).toHaveLength(0);
  });

  it("undo in single mode restores exercise.lastReps and lastRepsSets to pre-session values", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8, lastRepsSets: [8, 8, 8] }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-start-session"));

    const repBars = screen.getAllByTestId("rep-bar");
    await user.click(within(repBars[0]).getByTestId("rep-square-9"));

    // Tap bar wrapper to undo
    await user.click(screen.getAllByTestId("rep-bar")[0]);

    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastReps).toBe(8);
    expect(updated?.lastRepsSets).toEqual([8, 8, 8]);
  });

  it("single mode reference bar shows minimum of mixed previous per-set reps", async () => {
    const user = userEvent.setup();
    // lastRepsSets=[10, 8, 9] → min is 8; reference bar should have 8 squares filled
    createExercise(makeExercise({
      name: "Pull Ups",
      category: "Upper",
      sets: 3,
      maxReps: 12,
      lastReps: 10,
      lastRepsSets: [10, 8, 9],
    }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));

    // In single mode, rep-square-8 should be "reference" state, rep-square-9 should be "empty"
    const repBars = screen.getAllByTestId("rep-bar");
    const bar = repBars[0];
    expect(within(bar).getByTestId("rep-square-8").className).toContain("reference");
    expect(within(bar).getByTestId("rep-square-9").className).not.toContain("reference");
  });
});

// ─── Mode-switch mid-exercise ─────────────────────────────────────────────────

describe("mode switch mid-exercise", () => {
  it("separate→single: a fully-logged exercise stays green (done-check visible)", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    // Start in separate bars mode
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("tab-upper"));

    const multi = screen.getAllByTestId("rep-bar-multi")[0];
    await user.click(within(multi).getByTestId("rep-square-set-0-9"));
    await user.click(within(multi).getByTestId("rep-square-set-1-9"));
    await user.click(within(multi).getByTestId("rep-square-set-2-9"));

    // All sets logged → done-check should be visible
    expect(screen.getByTestId("done-check")).toBeInTheDocument();

    // Switch to single mode
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    // Exercise should still appear complete (not go grey)
    expect(screen.getByTestId("done-check")).toBeInTheDocument();
  });

  it("separate→single: partial exercise still shows reference bar", async () => {
    const user = userEvent.setup();
    // lastReps=8 for all sets, logging only set 0 with 9 reps
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("tab-upper"));

    // Log only the first set
    const multi = screen.getAllByTestId("rep-bar-multi")[0];
    await user.click(within(multi).getByTestId("rep-square-set-0-9"));

    // Switch to single mode
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    // Reference bar (square 8) should be visible — NOT empty
    const bar = screen.getAllByTestId("rep-bar")[0];
    expect(within(bar).getByTestId("rep-square-8").className).toContain("reference");
  });

  it("single→separate: a logged exercise stays complete (done-check visible)", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("tab-upper"));

    // Log in single mode
    const bars = screen.getAllByTestId("rep-bar");
    await user.click(within(bars[0]).getByTestId("rep-square-9"));

    expect(screen.getByTestId("done-check")).toBeInTheDocument();

    // Switch to separate bars mode
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    // Exercise should still appear complete
    expect(screen.getByTestId("done-check")).toBeInTheDocument();
  });

  it("single→separate: all bars show as filled after mode switch", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("tab-upper"));

    await user.click(within(screen.getAllByTestId("rep-bar")[0]).getByTestId("rep-square-9"));

    // Switch to separate bars mode
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    // All 3 set bars should show square 9 as filled
    const multi = screen.getAllByTestId("rep-bar-multi")[0];
    expect(within(multi).getByTestId("rep-square-set-0-9").className).toContain("filled");
    expect(within(multi).getByTestId("rep-square-set-1-9").className).toContain("filled");
    expect(within(multi).getByTestId("rep-square-set-2-9").className).toContain("filled");
  });

  it("separate→single: undo removes all session sets from storage", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8 }));
    renderApp();

    // Log all sets in separate mode
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("tab-upper"));

    const multi = screen.getAllByTestId("rep-bar-multi")[0];
    await user.click(within(multi).getByTestId("rep-square-set-0-9"));
    await user.click(within(multi).getByTestId("rep-square-set-1-9"));
    await user.click(within(multi).getByTestId("rep-square-set-2-9"));

    // Switch to single mode
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    // Tap the single bar to undo
    await user.click(screen.getAllByTestId("rep-bar")[0]);

    // All 3 session sets should be gone
    const session = getActiveSession()!;
    expect(getSessionSets(session.id)).toHaveLength(0);
  });

  it("separate→single: undo restores exercise to pre-session state", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", sets: 3, maxReps: 12, lastReps: 8, lastRepsSets: [8, 8, 8] }));
    renderApp();

    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("tab-upper"));

    const multi = screen.getAllByTestId("rep-bar-multi")[0];
    await user.click(within(multi).getByTestId("rep-square-set-0-9"));
    await user.click(within(multi).getByTestId("rep-square-set-1-9"));
    await user.click(within(multi).getByTestId("rep-square-set-2-9"));

    // Switch to single mode then undo
    await user.click(screen.getByTestId("btn-open-settings"));
    await user.click(screen.getByTestId("toggle-separate-bars"));
    await user.click(screen.getByTestId("settings-close"));

    await user.click(screen.getAllByTestId("rep-bar")[0]);

    const updated = getExercises().find((e) => e.id === ex.id);
    expect(updated?.lastReps).toBe(8);
    expect(updated?.lastRepsSets).toEqual([8, 8, 8]);
  });
});

// ─── Export / Import bar ──────────────────────────────────────────────────────

describe("export/import bar", () => {
  it("renders the export button", () => {
    renderApp();
    expect(screen.getByTestId("btn-export")).toBeInTheDocument();
  });

  it("renders the import button", () => {
    renderApp();
    expect(screen.getByTestId("btn-import")).toBeInTheDocument();
  });
});

// ─── Favourites ─────────────────────────────────────────────────────────────

describe("favourites", () => {
  it("favourites tab is always visible", () => {
    renderApp();
    expect(screen.getByTestId("tab-favourites")).toBeInTheDocument();
  });

  it("shows empty state when no exercises are favourited", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("tab-favourites"));
    expect(screen.getByText("No favourite exercises yet.")).toBeInTheDocument();
  });

  it("does not show the Add Exercise button on the Favourites tab", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("tab-favourites"));
    expect(screen.queryByTestId("btn-add-exercise")).not.toBeInTheDocument();
  });

  it("does not show the remove-group button on the Favourites tab", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("tab-favourites"));
    expect(screen.queryByTestId("btn-remove-group")).not.toBeInTheDocument();
  });

  it("every exercise card renders a favourite toggle button", () => {
    renderApp();
    const btns = screen.getAllByTestId("btn-favourite");
    expect(btns.length).toBeGreaterThan(0);
  });

  it("toggling favourite star adds exercise to favourites tab", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-favourite"));
    await user.click(screen.getByTestId("tab-favourites"));
    expect(screen.getByText("Pull Ups")).toBeInTheDocument();
  });

  it("toggling favourite star again removes exercise from favourites tab", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", isFavourite: true }));
    renderApp();
    await user.click(screen.getByTestId("tab-favourites"));
    expect(screen.getByText("Pull Ups")).toBeInTheDocument();
    await user.click(screen.getByTestId("btn-favourite"));
    expect(screen.getByText("No favourite exercises yet.")).toBeInTheDocument();
  });

  it("clicking the star button sets isFavourite in storage", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Star Me" }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    const card = screen.getByTestId(`exercise-card-${ex.id}`);
    await user.click(within(card).getByTestId("btn-favourite"));
    expect(getExercises().find((e) => e.id === ex.id)?.isFavourite).toBe(true);
  });

  it("clicking the star a second time clears isFavourite in storage", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Unstar Me" }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    const card = screen.getByTestId(`exercise-card-${ex.id}`);
    await user.click(within(card).getByTestId("btn-favourite"));
    await user.click(within(card).getByTestId("btn-favourite"));
    expect(getExercises().find((e) => e.id === ex.id)?.isFavourite).toBe(false);
  });

  it("a pre-favourited exercise appears on the Favourites tab", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Already Starred" }));
    updateExercise(ex.id, { isFavourite: true });
    renderApp();
    await user.click(screen.getByTestId("tab-favourites"));
    expect(screen.getByText("Already Starred")).toBeInTheDocument();
  });

  it("a non-favourited exercise is absent from the Favourites tab", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Not Starred" }));
    renderApp();
    await user.click(screen.getByTestId("tab-favourites"));
    expect(screen.queryByText("Not Starred")).not.toBeInTheDocument();
  });

  it("un-favouriting an exercise removes it from the Favourites tab view", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Will Unstar" }));
    updateExercise(ex.id, { isFavourite: true });
    renderApp();
    await user.click(screen.getByTestId("tab-favourites"));
    expect(screen.getByText("Will Unstar")).toBeInTheDocument();
    const card = screen.getByTestId(`exercise-card-${ex.id}`);
    await user.click(within(card).getByTestId("btn-favourite"));
    expect(screen.queryByText("Will Unstar")).not.toBeInTheDocument();
  });

  it("favourite exercises are active during a session", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", isFavourite: true }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("tab-favourites"));
    // Rep bar should be tappable (active)
    const repBar = screen.getByTestId("rep-bar");
    const square = within(repBar).getByTestId("rep-square-8");
    expect(square.className).toContain("tappable");
  });

  it("persists isFavourite in storage", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-favourite"));
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.isFavourite).toBe(true);
  });

  it("the exercise edit category dropdown does not contain 'Favourites'", async () => {
    const user = userEvent.setup();
    renderApp();
    // Open edit sheet for the first exercise on Back tab
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getAllByTestId("btn-edit")[0]);
    const select = screen.getByTestId("edit-category") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).not.toContain("Favourites");
  });
});

// ─── Tempo ──────────────────────────────────────────────────────────────────

describe("tempo", () => {
  it("displays tempo on exercise card when set", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", tempo: "2-1-3" }));
    renderApp();
    expect(screen.getByText(/tempo: 2-1-3/)).toBeInTheDocument();
  });

  it("does not show tempo text when not set", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    expect(screen.queryByText(/tempo:/)).not.toBeInTheDocument();
  });

  it("can set tempo via edit sheet", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-edit"));
    await user.type(screen.getByTestId("edit-tempo"), "3-1-2");
    await user.click(screen.getByTestId("edit-save"));
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.tempo).toBe("3-1-2");
  });
});

// ─── Session summary ────────────────────────────────────────────────────────

describe("session summary", () => {
  it("shows session summary with exercise count after ending session", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-9"));
    await user.click(screen.getByTestId("btn-end-session"));
    await user.click(screen.getByTestId("btn-end-confirm"));
    expect(screen.getByTestId("summary-sheet")).toBeInTheDocument();
    expect(screen.getByText("Session Complete")).toBeInTheDocument();
    expect(screen.getByText(/1 exercise/)).toBeInTheDocument();
  });

  it("shows empty message when no exercises were logged", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("btn-end-session"));
    await user.click(screen.getByTestId("btn-end-confirm"));
    expect(screen.getByText("No exercises logged this session.")).toBeInTheDocument();
  });

  it("summary closes when Done is clicked", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("btn-end-session"));
    await user.click(screen.getByTestId("btn-end-confirm"));
    expect(screen.getByTestId("summary-sheet")).toBeInTheDocument();
    await user.click(screen.getByTestId("summary-close"));
    expect(screen.queryByTestId("summary-sheet")).not.toBeInTheDocument();
  });
});

// ─── Session counter ────────────────────────────────────────────────────────

describe("session counter", () => {
  it("counter is not visible when no session is active", () => {
    renderApp();
    expect(screen.queryByTestId("session-counter")).not.toBeInTheDocument();
  });

  it("counter shows 0 when session starts", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    expect(screen.getByTestId("session-counter")).toHaveTextContent("0");
  });

  it("counter increments when an exercise is logged", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-8"));
    expect(screen.getByTestId("session-counter")).toHaveTextContent("1");
  });

  it("counter decrements when a logged exercise is undone", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-8"));
    expect(screen.getByTestId("session-counter")).toHaveTextContent("1");
    // Undo by tapping the rep bar
    await user.click(screen.getByTestId("rep-bar"));
    expect(screen.getByTestId("session-counter")).toHaveTextContent("0");
  });
});

// ─── Weight prompt ──────────────────────────────────────────────────────────

describe("weight prompt", () => {
  it("shows weight prompt when max reps are tapped", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", maxReps: 12, lastReps: 8 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-12"));
    await waitFor(() => expect(screen.getByTestId("weight-prompt")).toBeInTheDocument());
  });

  it("cancelling weight prompt clears the pending log", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", maxReps: 12, lastReps: 8 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-12"));
    await waitFor(() => expect(screen.getByTestId("weight-prompt")).toBeInTheDocument());
    await user.click(screen.getByTestId("weight-prompt-cancel"));
    expect(screen.queryByTestId("weight-prompt")).not.toBeInTheDocument();
    // Rep bar should still be tappable (not logged)
    const square = screen.getByTestId("rep-square-8");
    expect(square.className).toContain("tappable");
  });

  it("confirming weight prompt logs the set and updates weight", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", weight: 10, maxReps: 12, lastReps: 8 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-12"));
    await waitFor(() => expect(screen.getByTestId("weight-prompt")).toBeInTheDocument());
    await user.type(screen.getByTestId("weight-prompt-input"), "12.5");
    await user.click(screen.getByTestId("weight-prompt-confirm"));
    expect(screen.queryByTestId("weight-prompt")).not.toBeInTheDocument();
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.weight).toBe(12.5);
  });

  it("lower button shows weight decrease prompt", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", weight: 20 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("btn-decrease-weight"));
    await waitFor(() => expect(screen.getByTestId("weight-prompt")).toBeInTheDocument());
  });

  it("confirming weight increase stores previousWeight in storage", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", weight: 10, maxReps: 12, lastReps: 8 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-12"));
    await waitFor(() => expect(screen.getByTestId("weight-prompt")).toBeInTheDocument());
    await user.type(screen.getByTestId("weight-prompt-input"), "12.5");
    await user.click(screen.getByTestId("weight-prompt-confirm"));
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.previousWeight).toBe(10);
    expect(stored?.weightChangedInSession).toBeDefined();
  });

  it("confirming weight decrease stores previousWeight in storage", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", weight: 20 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("btn-decrease-weight"));
    await waitFor(() => expect(screen.getByTestId("weight-prompt")).toBeInTheDocument());
    await user.type(screen.getByTestId("weight-prompt-input"), "18");
    await user.click(screen.getByTestId("weight-prompt-confirm"));
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.previousWeight).toBe(20);
  });
});

// ─── Weight context display ─────────────────────────────────────────────────

describe("weight context display", () => {
  it("shows dumbbell icon on every exercise card", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", weight: 20 }));
    renderApp();
    expect(screen.getByTestId("icon-dumbbell")).toBeInTheDocument();
  });

  it("shows '(was Xkg)' when previousWeight is set from a prior session", () => {
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", weight: 30 }));
    updateExercise(ex.id, { previousWeight: 28, weightChangedInSession: 999 });
    renderApp();
    expect(screen.getByTestId("previous-weight")).toHaveTextContent("(was 28kg)");
  });

  it("does not show '(was Xkg)' when weight was changed in the current session", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", weight: 10, maxReps: 12, lastReps: 8 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-12"));
    await waitFor(() => expect(screen.getByTestId("weight-prompt")).toBeInTheDocument());
    await user.type(screen.getByTestId("weight-prompt-input"), "12.5");
    await user.click(screen.getByTestId("weight-prompt-confirm"));
    // previousWeight is set but weightChangedInSession matches current session
    expect(screen.queryByTestId("previous-weight")).not.toBeInTheDocument();
  });

  it("shows '(was Xkg)' with lbs when weight unit is lbs", () => {
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", weight: 30 }));
    updateExercise(ex.id, { previousWeight: 25, weightChangedInSession: 999 });
    saveSettings({ showSeparateBars: false, weightUnit: "lbs" });
    renderApp();
    expect(screen.getByTestId("previous-weight")).toHaveTextContent("(was 25lbs)");
  });

  it("does not show '(was Xkg)' when previousWeight is not set", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper", weight: 20 }));
    renderApp();
    expect(screen.queryByTestId("previous-weight")).not.toBeInTheDocument();
  });
});

// ─── Add exercise ───────────────────────────────────────────────────────────

describe("add exercise", () => {
  it("add exercise button not visible on retired tab", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    updateExercise(ex.id, { archived: true });
    renderApp();
    await user.click(screen.getByTestId("tab-retired"));
    expect(screen.queryByTestId("btn-add-exercise")).not.toBeInTheDocument();
  });

  it("add exercise button not visible on favourites tab", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("tab-favourites"));
    expect(screen.queryByTestId("btn-add-exercise")).not.toBeInTheDocument();
  });

  it("adding exercise with tempo persists it", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-exercise"));
    await user.clear(screen.getByTestId("edit-name"));
    await user.type(screen.getByTestId("edit-name"), "New Move");
    await user.type(screen.getByTestId("edit-tempo"), "2-0-2");
    await user.click(screen.getByTestId("edit-save"));
    const stored = getExercises().find((e) => e.name === "New Move");
    expect(stored?.tempo).toBe("2-0-2");
  });
});

// ─── Add category ───────────────────────────────────────────────────────────

describe("add category", () => {
  it("shows error when submitting empty category name", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-category"));
    await user.click(screen.getByTestId("add-category-confirm"));
    expect(screen.getByTestId("add-category-error")).toHaveTextContent("Please enter a category name.");
  });

  it("shows error when category name already exists", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-category"));
    await user.type(screen.getByTestId("add-category-input"), "Upper");
    await user.click(screen.getByTestId("add-category-confirm"));
    expect(screen.getByTestId("add-category-error")).toHaveTextContent("A category with that name already exists.");
  });

  it("adding a new category creates a tab", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("btn-add-category"));
    await user.type(screen.getByTestId("add-category-input"), "Arms");
    await user.click(screen.getByTestId("add-category-confirm"));
    expect(screen.getByTestId("tab-arms")).toBeInTheDocument();
  });
});

// ─── Remove empty group ─────────────────────────────────────────────────────

describe("remove empty group", () => {
  it("shows remove group button on empty category tab", async () => {
    const user = userEvent.setup();
    saveCategories([...getCategories(), "Empty"]);
    renderApp();
    await user.click(screen.getByTestId("tab-empty"));
    expect(screen.getByTestId("btn-remove-group")).toBeInTheDocument();
  });

  it("confirming remove group deletes the category", async () => {
    const user = userEvent.setup();
    saveCategories([...getCategories(), "Empty"]);
    renderApp();
    await user.click(screen.getByTestId("tab-empty"));
    await user.click(screen.getByTestId("btn-remove-group"));
    await user.click(screen.getByTestId("btn-remove-group-confirm"));
    expect(screen.queryByTestId("tab-empty")).not.toBeInTheDocument();
  });

  it("cancelling remove group keeps the category", async () => {
    const user = userEvent.setup();
    saveCategories([...getCategories(), "Empty"]);
    renderApp();
    await user.click(screen.getByTestId("tab-empty"));
    await user.click(screen.getByTestId("btn-remove-group"));
    await user.click(screen.getByTestId("btn-remove-group-cancel"));
    expect(screen.getByTestId("tab-empty")).toBeInTheDocument();
  });
});

// ─── Storage: deleteSessionSetById ──────────────────────────────────────────

describe("deleteSessionSetById", () => {
  it("removes a single set by ID without affecting others", () => {
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    const session = startSession();
    const set1 = logSet({ sessionId: session.id, exerciseId: ex.id, weight: 0, repsAchieved: 8 });
    const set2 = logSet({ sessionId: session.id, exerciseId: ex.id, weight: 0, repsAchieved: 9 });
    deleteSessionSetById(set1.id);
    const remaining = getSessionSets(session.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(set2.id);
  });
});

// ─── Exercise edit: retire and delete ──────────────────────────────────────

describe("exercise edit: retire and delete", () => {
  it("retire toggle from edit sheet moves exercise to retired", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-edit"));
    await user.click(screen.getByTestId("btn-retire-toggle"));
    // Exercise should now be in retired tab
    await user.click(screen.getByTestId("tab-retired"));
    expect(screen.getByText("Pull Ups")).toBeInTheDocument();
  });

  it("delete button only shows for retired exercises", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-edit"));
    expect(screen.queryByTestId("btn-delete")).not.toBeInTheDocument();
  });

  it("deleting a retired exercise removes it from storage", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    updateExercise(ex.id, { archived: true });
    renderApp();
    await user.click(screen.getByTestId("tab-retired"));
    await user.click(screen.getByTestId("btn-edit"));
    await user.click(screen.getByTestId("btn-delete"));
    await user.click(screen.getByTestId("btn-delete-confirm"));
    expect(getExercises().find((e) => e.id === ex.id)).toBeUndefined();
  });
});

// ─── lastTrend persistence ──────────────────────────────────────────────────

describe("lastTrend storage persistence", () => {
  it("saves lastTrend to storage when exercise is logged up", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", lastReps: 8, maxReps: 12 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-9"));
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.lastTrend).toBe("up");
  });

  it("saves lastTrend as down when reps decline", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", lastReps: 8, maxReps: 12 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-7"));
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.lastTrend).toBe("down");
  });

  it("saves lastTrend as null when reps are equal", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", lastReps: 8, maxReps: 12 }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-8"));
    const stored = getExercises().find((e) => e.id === ex.id);
    expect(stored?.lastTrend).toBeNull();
  });

  it("restores lastTrend on undo", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper", lastReps: 8, maxReps: 12, lastTrend: "down" }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    await user.click(screen.getByTestId("rep-square-9"));
    expect(getExercises().find((e) => e.id === ex.id)?.lastTrend).toBe("up");
    // Undo
    await user.click(screen.getByTestId("rep-bar"));
    expect(getExercises().find((e) => e.id === ex.id)?.lastTrend).toBe("down");
  });
});

// ─── Days since last done ─────────────────────────────────────────────────────

describe("days since last done", () => {
  it("does not show days badge when exercise has never been done", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    expect(screen.queryByTestId("days-since-last-done")).not.toBeInTheDocument();
  });

  it("does not show days badge during current session", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));
    renderApp();
    await user.click(screen.getByTestId("btn-start-session"));
    expect(screen.queryByTestId("days-since-last-done")).not.toBeInTheDocument();
  });

  it("shows days badge when exercise was done in a previous session", async () => {
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));

    // Create a previous session
    const oldSession = startSession();
    logSet({ sessionId: oldSession.id, exerciseId: ex.id, weight: 0, repsAchieved: 8 });
    endSession(oldSession.id);

    // Set the session to 5 days ago
    const sessions = getSessions();
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    sessions.find((s) => s.id === oldSession.id)!.startedAt = fiveDaysAgo.toISOString();
    localStorage.setItem("lt_sessions", JSON.stringify(sessions));

    renderApp();
    expect(screen.getByTestId("days-since-last-done")).toBeInTheDocument();
    expect(screen.getByTestId("days-since-last-done").textContent).toBe("5d");
  });

  it("shows 0d when exercise was done earlier today in a previous session", async () => {
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));

    // Create a previous session today
    const todaySession = startSession();
    logSet({ sessionId: todaySession.id, exerciseId: ex.id, weight: 0, repsAchieved: 8 });
    endSession(todaySession.id);

    renderApp();
    expect(screen.getByTestId("days-since-last-done")).toBeInTheDocument();
    expect(screen.getByTestId("days-since-last-done").textContent).toBe("0d");
  });

  it("does not show days badge for current session, even after logging", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));

    // Create a previous session
    const oldSession = startSession();
    logSet({ sessionId: oldSession.id, exerciseId: ex.id, weight: 0, repsAchieved: 8 });
    endSession(oldSession.id);

    // Start a new session
    const currentSession = startSession();

    renderApp();

    // Days should show before logging in current session
    expect(screen.getByTestId("days-since-last-done")).toBeInTheDocument();

    // Log in current session
    await user.click(screen.getByTestId("rep-square-8"));

    // Days should still show (current session is excluded from calculation)
    expect(screen.getByTestId("days-since-last-done")).toBeInTheDocument();
  });

  it("shows days from most recent session when multiple past sessions exist", async () => {
    const ex = createExercise(makeExercise({ name: "Pull Ups", category: "Upper" }));

    // Create first session 10 days ago
    const session1 = startSession();
    logSet({ sessionId: session1.id, exerciseId: ex.id, weight: 0, repsAchieved: 8 });
    endSession(session1.id);

    // Create second session 3 days ago
    const session2 = startSession();
    logSet({ sessionId: session2.id, exerciseId: ex.id, weight: 0, repsAchieved: 9 });
    endSession(session2.id);

    // Set session dates
    const sessions = getSessions();
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    sessions.find((s) => s.id === session1.id)!.startedAt = tenDaysAgo.toISOString();
    sessions.find((s) => s.id === session2.id)!.startedAt = threeDaysAgo.toISOString();
    localStorage.setItem("lt_sessions", JSON.stringify(sessions));

    renderApp();
    expect(screen.getByTestId("days-since-last-done")).toBeInTheDocument();
    // Should show 3d (most recent), not 10d
    expect(screen.getByTestId("days-since-last-done").textContent).toBe("3d");
  });
});

// ─── Tab-switch completion state ──────────────────────────────────────────────

describe("tab-switch preserves exercise completion state", () => {
  it("an exercise logged on one tab still shows as done after switching away and back", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-start-session"));

    // Log 6 reps on the first exercise (Bench Press, maxReps=8, so use 6 to avoid weight prompt)
    const repBar = screen.getAllByTestId("rep-bar")[0];
    await user.click(within(repBar).getByTestId("rep-square-6"));

    // Verify it's marked done before switching
    expect(screen.getAllByTestId("done-check").length).toBeGreaterThan(0);

    // Switch to a different tab and back
    await user.click(screen.getByTestId("tab-lower"));
    await user.click(screen.getByTestId("tab-upper"));

    // The done state must survive the remount
    expect(screen.getAllByTestId("done-check").length).toBeGreaterThan(0);
  });

  it("session counter reflects previously logged exercises after a tab switch", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTestId("tab-upper"));
    await user.click(screen.getByTestId("btn-start-session"));

    const repBar = screen.getAllByTestId("rep-bar")[0];
    await user.click(within(repBar).getByTestId("rep-square-6"));

    await user.click(screen.getByTestId("tab-lower"));
    await user.click(screen.getByTestId("tab-upper"));

    // Counter should still show at least 1
    expect(screen.getByTestId("session-counter")).toHaveTextContent("1");
  });
});
