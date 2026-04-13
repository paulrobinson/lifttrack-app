import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiftTracker from "./LiftTracker";
import { createExercise, updateExercise, getExercises, getActiveSession, saveExercisesOrder, getCategories, saveCategories, startSession, endSession, logSet, archiveSession, getSessions } from "@/lib/storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExercise(overrides = {}) {
  return {
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
    await user.type(screen.getByTestId("add-category-input"), "back");
    await user.click(screen.getByTestId("add-category-confirm"));
    expect(screen.getByTestId("add-category-error")).toBeInTheDocument();
  });

  it("the exercise edit sheet shows custom categories in the group dropdown", async () => {
    const user = userEvent.setup();
    // Pre-seed a custom category
    saveCategories(["Back", "Chest", "Upper", "Legs", "Aquatics"]);
    createExercise(makeExercise({ name: "Pull Ups", category: "Back" }));
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
    await user.click(screen.getByTestId("tab-back"));
    await user.click(screen.getByTestId("tab-empty"));
    expect(screen.queryByTestId("btn-remove-group-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-remove-group")).toBeInTheDocument();
  });

  it("does not show the remove button on the Archive tab", async () => {
    const user = userEvent.setup();
    const ex = createExercise(makeExercise({ name: "Old Move" }));
    updateExercise(ex.id, { archived: true });
    renderApp();
    await user.click(screen.getByTestId("tab-archive"));
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

// ─── Separate bars mode ───────────────────────────────────────────────────────

describe("separate bars mode", () => {
  it("shows a single rep-bar per exercise when the setting is off (default)", () => {
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, lastReps: 8 }));
    renderApp();
    // In single-bar mode there should be exactly one rep-bar per exercise shown
    // (the default seeded exercises are also rendered; just check no rep-bar-multi)
    expect(screen.queryByTestId("rep-bar-multi")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("rep-bar").length).toBeGreaterThan(0);
  });

  it("shows rep-bar-multi containers when the separate bars setting is on", async () => {
    const user = userEvent.setup();
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, lastReps: 8 }));
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, lastReps: 8 }));
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
      category: "Back",
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, maxReps: 12, lastReps: 8 }));
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, maxReps: 12, lastReps: 8 }));
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, maxReps: 12, lastReps: 8 }));
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, maxReps: 12, lastReps: 8 }));
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, maxReps: 12, lastReps: 8 }));
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, maxReps: 12, lastReps: 8 }));
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, maxReps: 12, lastReps: 8 }));
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, maxReps: 12, lastReps: 8 }));
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
    createExercise(makeExercise({ name: "Pull Ups", category: "Back", sets: 3, maxReps: 12, lastReps: 8 }));
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
