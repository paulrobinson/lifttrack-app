import { useState } from "react";
import {
  type Exercise,
  type Settings,
  getCategories,
  deleteExercise,
  updateExercise,
} from "@/lib/storage";
import { Modal, cancelBtnStyle } from "./Modal";
import { IconDecline, IconUp, IconArchive, IconTrash } from "./icons";
import type { SetLog } from "./types";

// ─── Settings Panel ─────────────────────────────────────────────────────────────

export function SettingsPanel({ settings, onSettingsChange, onClose }: {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const toggle = (key: keyof Settings) => {
    const updated = { ...settings, [key]: !settings[key] };
    onSettingsChange(updated);
  };

  const isLbs = settings.weightUnit === "lbs";

  return (
    <div className="history-overlay" onClick={onClose} data-testid="settings-overlay">
      <div className="history-sheet" onClick={(e) => e.stopPropagation()} data-testid="settings-panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>Settings</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "22px", lineHeight: 1, padding: "0 4px" }}
            aria-label="Close settings"
            data-testid="settings-close"
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
            <div>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "2px" }}>
                Weight unit
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                Display weights in kilograms or pounds.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={isLbs}
              onClick={() => onSettingsChange({ ...settings, weightUnit: isLbs ? "kg" : "lbs" })}
              data-testid="toggle-weight-unit"
              aria-label={`Weight unit: ${isLbs ? "lbs" : "kg"}`}
              style={{
                flexShrink: 0,
                marginLeft: "16px",
                minWidth: "54px",
                height: "30px",
                borderRadius: "15px",
                border: "1px solid var(--color-border)",
                cursor: "pointer",
                background: "var(--color-surface-2, hsl(220 12% 18%))",
                position: "relative",
                transition: "background 200ms ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--text-xs)",
                fontWeight: 700,
                color: "var(--color-text)",
                padding: "0 12px",
              }}
            >
              {isLbs ? "lbs" : "kg"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
            <div>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "2px" }}>
                Show sets as separate bars
              </p>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                Display each set as its own rep bar instead of a single combined bar.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={settings.showSeparateBars}
              onClick={() => toggle("showSeparateBars")}
              data-testid="toggle-separate-bars"
              style={{
                flexShrink: 0,
                marginLeft: "16px",
                width: "44px",
                height: "26px",
                borderRadius: "13px",
                border: "none",
                cursor: "pointer",
                background: settings.showSeparateBars ? "var(--color-success)" : "var(--color-border)",
                position: "relative",
                transition: "background 200ms ease",
              }}
            >
              <span style={{
                position: "absolute",
                top: "3px",
                left: settings.showSeparateBars ? "21px" : "3px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#fff",
                transition: "left 200ms ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Category Dialog ────────────────────────────────────────────────────────

export function AddCategoryDialog({ existingCategories, onAdd, onClose }: {
  existingCategories: string[];
  onAdd: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a category name.");
      return;
    }
    if (existingCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setError("A category with that name already exists.");
      return;
    }
    onAdd(trimmed);
  };

  return (
    <Modal onClose={onClose}>
      <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginBottom: "16px" }}>Add Category</p>
      <div className="edit-field" style={{ marginBottom: "8px" }}>
        <label>Name</label>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          placeholder="e.g. Legs"
          data-testid="add-category-input"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
      </div>
      {error && (
        <p style={{ fontSize: "var(--text-xs)", color: "hsl(0 70% 60%)", marginBottom: "12px" }} data-testid="add-category-error">
          {error}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
        <button
          className="btn-confirm"
          onClick={handleAdd}
          style={{ width: "100%", padding: "12px" }}
          data-testid="add-category-confirm"
        >
          Add Category
        </button>
        <button onClick={onClose} style={cancelBtnStyle} data-testid="add-category-cancel">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ─── Exercise Edit / Add Sheet ──────────────────────────────────────────────────

export function ExerciseSheet({ exercise, defaultCategory, onSave, onClose, onRetireToggle, onDelete, onTabSwitch, weightUnit = "kg" }: {
  exercise?: Exercise;
  defaultCategory?: string;
  onSave: (data: Partial<Exercise>) => void;
  onClose: () => void;
  onRetireToggle?: () => void;
  onDelete?: () => void;
  onTabSwitch?: (cat: string) => void;
  weightUnit?: "kg" | "lbs";
}) {
  const isNew = !exercise;
  const sheetCategories = getCategories();
  const [name, setName] = useState(exercise?.name ?? "");
  const [weight, setWeight] = useState(exercise ? String(exercise.weight) : "");
  const [maxReps, setMaxReps] = useState(exercise ? String(exercise.maxReps) : "12");
  const [minReps, setMinReps] = useState(exercise?.minReps != null ? String(exercise.minReps) : "");
  const [sets, setSets] = useState(exercise ? String(exercise.sets) : "3");
  const [category, setCategory] = useState<string>(exercise?.category ?? defaultCategory ?? sheetCategories[0] ?? "Back");
  const [tempo, setTempo] = useState(exercise?.tempo ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    const parsedMinReps = parseInt(minReps);
    const data: Partial<Exercise> = {
      name: name.trim() || exercise?.name || "New Exercise",
      weight: parseFloat(weight) || exercise?.weight || 0,
      maxReps: parseInt(maxReps) || exercise?.maxReps || 12,
      minReps: !isNaN(parsedMinReps) && parsedMinReps > 0 ? parsedMinReps : undefined,
      sets: parseInt(sets) || exercise?.sets || 3,
      category,
      tempo: tempo.trim() || undefined,
    };
    if (exercise && category !== exercise.category && onTabSwitch) {
      onTabSwitch(category);
    }
    onSave(data);
  };

  return (
    <div className="edit-overlay" onClick={onClose} data-testid="edit-overlay">
      <div className="edit-sheet" onClick={(e) => e.stopPropagation()} data-testid="edit-sheet">
        <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "16px" }}>
          {isNew ? "Add Exercise" : "Edit Exercise"}
        </h3>

        <div className="edit-field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bench Press" data-testid="edit-name" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <div className="edit-field">
            <label>Weight ({weightUnit})</label>
            <input type="number" inputMode="decimal" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 30" data-testid="edit-weight" />
          </div>
          <div className="edit-field">
            <label>Max Reps</label>
            <input type="number" inputMode="numeric" value={maxReps} onChange={(e) => setMaxReps(e.target.value)} data-testid="edit-max-reps" />
          </div>
          <div className="edit-field">
            <label>Min Reps</label>
            <input type="number" inputMode="numeric" value={minReps} onChange={(e) => setMinReps(e.target.value)} placeholder="—" data-testid="edit-min-reps" />
          </div>
          <div className="edit-field">
            <label>Sets</label>
            <input type="number" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} data-testid="edit-sets" />
          </div>
          <div className="edit-field" style={{ gridColumn: "span 2" }}>
            <label>Group</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="edit-category">
              {sheetCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="edit-field" style={{ marginTop: "12px" }}>
          <label>Tempo</label>
          <input value={tempo} onChange={(e) => setTempo(e.target.value)} placeholder="e.g. 1-2-3" data-testid="edit-tempo" />
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
          <button className="btn-confirm" style={{ flex: 1, borderRadius: "12px", padding: "12px" }} onClick={handleSave} data-testid="edit-save">
            {isNew ? "Add Exercise" : "Save Changes"}
          </button>
          <button className="btn-cancel-prompt" style={{ padding: "12px 16px", borderRadius: "12px" }} onClick={onClose}>
            Cancel
          </button>
        </div>

        {!isNew && onRetireToggle && (
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              onClick={onRetireToggle}
              style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-xs)", fontWeight: 600, color: exercise?.archived ? "var(--color-success)" : "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
              data-testid="btn-retire-toggle"
            >
              <IconArchive />
              {exercise?.archived ? "Un-retire" : "Retire exercise"}
            </button>

            {exercise?.archived && onDelete && (
              confirmDelete ? (
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>Sure?</span>
                  <button
                    onClick={onDelete}
                    style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "var(--text-xs)", fontWeight: 700, color: "hsl(0 70% 60%)", background: "hsl(0 50% 15%)", border: "1px solid hsl(0 50% 30%)", borderRadius: "8px", padding: "4px 10px", cursor: "pointer" }}
                    data-testid="btn-delete-confirm"
                  >
                    <IconTrash /> Delete
                  </button>
                  <button onClick={() => setConfirmDelete(false)} style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}>No</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "var(--text-xs)", fontWeight: 600, color: "hsl(0 60% 55%)", background: "none", border: "none", cursor: "pointer" }}
                  data-testid="btn-delete"
                >
                  <IconTrash /> Delete
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session Summary ────────────────────────────────────────────────────────────

export function SessionSummary({ logs, onClose, weightUnit = "kg" }: { logs: SetLog[]; onClose: () => void; weightUnit?: "kg" | "lbs" }) {
  const declineCount = logs.filter((l) => l.isDecline).length;
  const upCount = logs.filter((l) => l.isUp).length;

  return (
    <div className="summary-overlay" onClick={onClose} data-testid="summary-overlay">
      <div className="summary-sheet" onClick={(e) => e.stopPropagation()} data-testid="summary-sheet">
        <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginBottom: "4px" }}>Session Complete</h3>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginBottom: "16px" }}>
          {logs.length} exercise{logs.length !== 1 ? "s" : ""}
          {upCount > 0 && <span style={{ color: "hsl(142 70% 50%)" }}> · {upCount} up</span>}
          {declineCount > 0 && <span style={{ color: "var(--color-warning)" }}> · {declineCount} down</span>}
        </p>

        {logs.length === 0 ? (
          <p style={{ color: "var(--color-text-faint)", fontSize: "var(--text-sm)", textAlign: "center", padding: "20px 0" }}>
            No exercises logged this session.
          </p>
        ) : (
          logs.map((log, i) => (
            <div className="summary-row" key={i}>
              <div>
                <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{log.exerciseName}</span>
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginLeft: "5px" }}>{log.sets} {log.sets === 1 ? "set" : "sets"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                  {log.weight}{weightUnit} × {log.repsAchieved}
                </span>
                {log.isDecline && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "var(--color-warning)", fontSize: "10px", fontWeight: 700 }}>
                    <IconDecline />
                  </span>
                )}
                {log.isUp && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "hsl(142 70% 50%)", fontSize: "10px", fontWeight: 700 }}>
                    <IconUp />
                  </span>
                )}
              </div>
            </div>
          ))
        )}

        <button
          className="btn-confirm"
          style={{ width: "100%", borderRadius: "12px", padding: "12px", marginTop: "16px" }}
          onClick={onClose}
          data-testid="summary-close"
        >
          Done
        </button>
      </div>
    </div>
  );
}
