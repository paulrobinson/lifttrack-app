import { useState, useEffect, useRef } from "react";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type Exercise,
  type SessionSet,
  type Settings,
  updateExercise,
  deleteExercise,
  logSet,
  logSetBulk,
  deleteSessionSetById,
  getSessionSets,
  getDaysSinceLastDone,
} from "@/lib/storage";
import { IconCheck, IconDecline, IconUp, IconEdit, IconStarFilled, IconStarEmpty } from "./icons";
import { ExerciseSheet } from "./Dialogs";
import type { SetLog } from "./types";

// ─── computeSetOutcome ──────────────────────────────────────────────────────────

export function computeSetOutcome(
  reps: number,
  weight: number,
  prevReps: number | null,
  prevWeight: number,
): { decline: boolean; up: boolean } {
  const prev = prevReps ?? 0;
  const decline = reps < prev || weight < prevWeight;
  const up = !decline && prev > 0 && reps > prev;
  return { decline, up };
}

// ─── Rep Bar Row ────────────────────────────────────────────────────────────────

function RepBarRow({ maxReps, referenceReps, isActive, loggedReps, onTap, testIdSuffix }: {
  maxReps: number;
  referenceReps: number | null;
  isActive: boolean;
  loggedReps: number | null;
  onTap: (r: number) => void;
  testIdSuffix?: string;
}) {
  const squares = Array.from({ length: maxReps }, (_, i) => i + 1);
  const suffix = testIdSuffix ?? "";

  const getState = (rep: number) => {
    if (loggedReps !== null) return rep <= loggedReps ? "filled" : "empty";
    return rep <= (referenceReps ?? 0) ? "reference" : "empty";
  };

  const showLabel = (rep: number) => {
    if (rep === maxReps) return true;
    if (loggedReps !== null && rep === loggedReps && rep !== maxReps) return true;
    if (loggedReps === null && rep === (referenceReps ?? 0) && rep !== maxReps) return true;
    return false;
  };

  const tappable = isActive && loggedReps === null;

  return (
    <div className="rep-bar" data-testid={`rep-bar${suffix}`}>
      {squares.map((rep) => {
        const state = getState(rep);
        return (
          <button
            key={rep}
            className={`rep-square ${state} ${tappable ? "tappable" : ""}`}
            onClick={tappable ? () => onTap(rep) : undefined}
            aria-label={`${rep} rep${rep !== 1 ? "s" : ""}`}
            data-testid={`rep-square${suffix}-${rep}`}
            tabIndex={tappable ? 0 : -1}
            style={{ cursor: tappable ? "pointer" : "default" }}
          >
            {showLabel(rep) && <span className="rep-label">{rep}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Rep Bar ────────────────────────────────────────────────────────────────────

function RepBar({ exercise, isActive, loggedReps, loggedRepsSets, onTap, onTapSet, onUndoSet, settings }: {
  exercise: Exercise;
  isActive: boolean;
  loggedReps: number | null;
  loggedRepsSets?: (number | null)[];
  onTap: (r: number) => void;
  onTapSet?: (i: number, r: number) => void;
  onUndoSet?: (i: number) => void;
  settings: Settings;
}) {
  const initialRefs = useRef({
    lastReps: exercise.lastReps,
    lastRepsSets: exercise.lastRepsSets ? [...exercise.lastRepsSets] : undefined,
  });

  if (!settings.showSeparateBars) {
    const validRefs = (initialRefs.current.lastRepsSets ?? []).filter((v): v is number => v != null);
    const referenceReps = validRefs.length > 0
      ? Math.min(...validRefs)
      : initialRefs.current.lastReps;
    return (
      <RepBarRow
        maxReps={exercise.maxReps}
        referenceReps={referenceReps}
        isActive={isActive}
        loggedReps={loggedReps}
        onTap={onTap}
      />
    );
  }

  const numBars = initialRefs.current.lastRepsSets?.length ?? exercise.sets;
  const anyLogged = loggedRepsSets?.some((r) => r !== null) ?? false;

  return (
    <>
      <div data-testid="rep-bar-multi">
        {Array.from({ length: numBars }, (_, i) => {
          const ref = initialRefs.current.lastRepsSets?.[i] ?? initialRefs.current.lastReps;
          const setLogged = loggedRepsSets?.[i] ?? null;

          if (setLogged !== null && isActive && onUndoSet) {
            return (
              <div key={i} onClick={() => onUndoSet(i)} style={{ cursor: "pointer" }}
                data-testid={`rep-bar-undo-set-${i}`}>
                <RepBarRow
                  maxReps={exercise.maxReps}
                  referenceReps={ref}
                  isActive={false}
                  loggedReps={setLogged}
                  onTap={() => {}}
                  testIdSuffix={`-set-${i}`}
                />
              </div>
            );
          }

          return (
            <RepBarRow
              key={i}
              maxReps={exercise.maxReps}
              referenceReps={ref}
              isActive={isActive && setLogged === null}
              loggedReps={setLogged}
              onTap={(r) => onTapSet?.(i, r)}
              testIdSuffix={`-set-${i}`}
            />
          );
        })}
      </div>
      {isActive && anyLogged && onUndoSet && (
        <p className="undo-hint">Tap bar to undo</p>
      )}
    </>
  );
}

// ─── Weight Prompt ──────────────────────────────────────────────────────────────

function WeightPrompt({ label, onConfirm, onCancel, weightUnit = "kg" }: {
  label: string; onConfirm: (w: number) => void; onCancel: () => void; weightUnit?: "kg" | "lbs";
}) {
  const [value, setValue] = useState("");
  const confirm = () => { const w = parseFloat(value); if (!isNaN(w) && w > 0) onConfirm(w); };
  return (
    <div className="inline-prompt" data-testid="weight-prompt">
      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{label}</span>
      <input autoFocus type="number" inputMode="decimal" step="0.5" min="0" className="prompt-input"
        placeholder="e.g. 32.5" value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") onCancel(); }}
        data-testid="weight-prompt-input" />
      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{weightUnit}</span>
      <button className="btn-confirm" onClick={confirm} data-testid="weight-prompt-confirm">✓</button>
      <button className="btn-cancel-prompt" onClick={onCancel} data-testid="weight-prompt-cancel">✕</button>
    </div>
  );
}

// ─── Exercise Card ──────────────────────────────────────────────────────────────

export function ExerciseCard({ exercise, isActive, sessionId, onSetLogged, onSetUndone, onExerciseChanged, onTabSwitch, onFavouriteToggle, settings }: {
  exercise: Exercise;
  isActive: boolean;
  sessionId: number | null;
  onSetLogged: (log: SetLog) => void;
  onSetUndone: (exerciseId: number) => void;
  onExerciseChanged: () => void;
  onTabSwitch: (cat: string) => void;
  onFavouriteToggle: () => void;
  settings: Settings;
}) {
  // ── Restore state on remount ──────────────────────────────────────────────
  // Switching tabs unmounts and remounts exercise cards, losing local state.
  // Seed state from the session's stored sets so the card looks correct when
  // the user returns to a tab mid-session.
  const [preloadedSets] = useState<SessionSet[]>(() => {
    if (!sessionId) return [];
    return getSessionSets(sessionId).filter((s) => s.exerciseId === exercise.id);
  });
  const wasLogged = preloadedSets.length > 0;

  const exerciseInitRef = useRef({
    lastReps: wasLogged ? preloadedSets[0].prevLastReps : exercise.lastReps,
    lastRepsSets: exercise.lastRepsSets ? [...exercise.lastRepsSets] : null,
    weight: exercise.weight,
    lastTrend: exercise.lastTrend ?? null,
  });

  // ── Single-bar mode state
  const [loggedReps, setLoggedReps] = useState<number | null>(
    wasLogged ? preloadedSets[preloadedSets.length - 1].repsAchieved : null
  );
  const singleModeSetIdsRef = useRef<number[]>(
    wasLogged ? preloadedSets.map((s) => s.id) : []
  );
  const [isDecline, setIsDecline] = useState(() => {
    if (!wasLogged) return false;
    const prev = preloadedSets[0].prevLastReps ?? 0;
    const curr = preloadedSets[preloadedSets.length - 1].repsAchieved;
    return prev > 0 && curr < prev;
  });
  const [isUp, setIsUp] = useState(() => {
    if (!wasLogged) return false;
    const prev = preloadedSets[0].prevLastReps ?? 0;
    const curr = preloadedSets[preloadedSets.length - 1].repsAchieved;
    return prev > 0 && curr > prev;
  });
  const [showWeightPrompt, setShowWeightPrompt] = useState<"increase" | "decrease" | null>(null);
  const [pendingReps, setPendingReps] = useState<number | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  // ── Multi-bar mode state
  const [loggedRepsSets, setLoggedRepsSets] = useState<(number | null)[]>(() => {
    if (!wasLogged) return Array(exercise.sets).fill(null);
    const slots = Array<number | null>(exercise.sets).fill(null);
    preloadedSets.slice(0, exercise.sets).forEach((s, i) => { slots[i] = s.repsAchieved; });
    return slots;
  });
  const [loggedSetIds, setLoggedSetIds] = useState<(number | null)[]>(() => {
    if (!wasLogged) return Array(exercise.sets).fill(null);
    const slots = Array<number | null>(exercise.sets).fill(null);
    preloadedSets.slice(0, exercise.sets).forEach((s, i) => { slots[i] = s.id; });
    return slots;
  });
  const [loggedOrder, setLoggedOrder] = useState<number[]>(() => {
    if (!wasLogged) return [];
    return Array.from({ length: Math.min(preloadedSets.length, exercise.sets) }, (_, i) => i);
  });
  const [pendingSetIdx, setPendingSetIdx] = useState<number | null>(null);

  // ── Derived
  const isSingleMode = !settings.showSeparateBars;
  const isComplete = isSingleMode
    ? loggedReps !== null
    : loggedRepsSets.every((r) => r !== null);

  // ── Mode-switch sync
  const loggedRepsRef = useRef(loggedReps);
  loggedRepsRef.current = loggedReps;
  const loggedRepsSetsRef = useRef(loggedRepsSets);
  loggedRepsSetsRef.current = loggedRepsSets;
  const loggedSetIdsRef = useRef(loggedSetIds);
  loggedSetIdsRef.current = loggedSetIds;
  useEffect(() => {
    if (isSingleMode) {
      if (loggedRepsSetsRef.current.every((r) => r !== null)) {
        setLoggedReps(Math.min(...(loggedRepsSetsRef.current as number[])));
        singleModeSetIdsRef.current = loggedSetIdsRef.current.filter((id): id is number => id !== null);
      }
    } else {
      if (loggedRepsRef.current !== null) {
        setLoggedRepsSets(Array(exercise.sets).fill(loggedRepsRef.current));
        setLoggedSetIds([...singleModeSetIdsRef.current]);
        setLoggedOrder(Array.from({ length: exercise.sets }, (_, i) => i));
      }
    }
  }, [isSingleMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Outcome computation
  const computeOutcomeForSingle = (reps: number, weight: number) => {
    const { lastReps, lastRepsSets } = exerciseInitRef.current;
    const prevTotal = lastRepsSets && lastRepsSets.length > 1
      ? lastRepsSets.reduce((a, b) => a + b, 0)
      : lastReps;
    const currentReps = lastRepsSets && lastRepsSets.length > 1
      ? reps * exercise.sets
      : reps;
    return computeSetOutcome(currentReps, weight, prevTotal, exerciseInitRef.current.weight);
  };

  const computeOutcomeForMulti = (completedSets: number[], weight: number) => {
    const { lastReps, lastRepsSets } = exerciseInitRef.current;
    const totalCurrent = completedSets.reduce((a, b) => a + b, 0);
    const prevTotal = lastRepsSets && lastRepsSets.length > 1
      ? lastRepsSets.reduce((a, b) => a + b, 0)
      : (lastReps !== null ? lastReps * exercise.sets : null);
    return computeSetOutcome(totalCurrent, weight, prevTotal, exerciseInitRef.current.weight);
  };

  // ── Single-bar commit & tap
  const commitLog = (reps: number, weight: number) => {
    if (!sessionId) return;
    const { decline, up } = computeOutcomeForSingle(reps, weight);
    setLoggedReps(reps);
    setIsDecline(decline);
    setIsUp(up);
    const created = logSetBulk({ sessionId, exerciseId: exercise.id, weight, repsAchieved: reps, numSets: exercise.sets });
    singleModeSetIdsRef.current = created.map((s) => s.id);
    updateExercise(exercise.id, { lastTrend: up ? "up" : decline ? "down" : null });
    onExerciseChanged();
    onSetLogged({ exerciseId: exercise.id, exerciseName: exercise.name, repsAchieved: reps, isDecline: decline, isUp: up, weight, sets: exercise.sets });
  };

  const handleRepTap = (reps: number) => {
    if (!isActive || !sessionId) return;
    if (loggedReps !== null) {
      setLoggedReps(null); setIsDecline(false); setIsUp(false);
      singleModeSetIdsRef.current.forEach((id) => deleteSessionSetById(id));
      singleModeSetIdsRef.current = [];
      updateExercise(exercise.id, { lastReps: exerciseInitRef.current.lastReps, lastRepsSets: exerciseInitRef.current.lastRepsSets, lastTrend: exerciseInitRef.current.lastTrend });
      onExerciseChanged();
      onSetUndone(exercise.id);
      return;
    }
    if (reps === exercise.maxReps) {
      setLoggedReps(reps);
      setPendingReps(reps);
      setTimeout(() => setShowWeightPrompt("increase"), 350);
    } else {
      commitLog(reps, exercise.weight);
    }
  };

  // ── Multi-bar commit & tap
  const commitSetLog = (setIndex: number, reps: number, weight: number, currentSets: (number | null)[]) => {
    if (!sessionId) return;
    const newSets = currentSets.map((r, i) => (i === setIndex ? reps : r));
    const newOrder = [...loggedOrder, setIndex];
    setLoggedOrder(newOrder);
    const created = logSet({ sessionId, exerciseId: exercise.id, weight, repsAchieved: reps, setIndex });
    setLoggedSetIds((prev) => { const n = [...prev]; n[setIndex] = created.id; return n; });
    onExerciseChanged();
    if (newSets.every((r) => r !== null)) {
      const { decline, up } = computeOutcomeForMulti(newSets as number[], weight);
      setIsDecline(decline);
      setIsUp(up);
      updateExercise(exercise.id, { lastTrend: up ? "up" : decline ? "down" : null });
      onSetLogged({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        repsAchieved: (newSets as number[]).reduce((a, b) => a + b, 0),
        isDecline: decline,
        isUp: up,
        weight,
        sets: exercise.sets,
      });
    }
  };

  const handleRepTapSet = (setIndex: number, reps: number) => {
    if (!isActive || !sessionId) return;
    if (reps === exercise.maxReps) {
      setLoggedRepsSets((prev) => { const n = [...prev]; n[setIndex] = reps; return n; });
      setPendingReps(reps);
      setPendingSetIdx(setIndex);
      setTimeout(() => setShowWeightPrompt("increase"), 350);
    } else {
      const newSets = loggedRepsSets.map((r, i) => (i === setIndex ? reps : r));
      setLoggedRepsSets(newSets);
      commitSetLog(setIndex, reps, exercise.weight, newSets);
    }
  };

  const handleUndoSet = (setIndex: number) => {
    if (!sessionId || loggedRepsSets[setIndex] === null) return;
    const setId = loggedSetIds[setIndex];
    const wasComplete = loggedRepsSets.every((r) => r !== null);
    setLoggedRepsSets((prev) => { const n = [...prev]; n[setIndex] = null; return n; });
    setLoggedSetIds((prev) => { const n = [...prev]; n[setIndex] = null; return n; });
    setLoggedOrder((prev) => prev.filter((i) => i !== setIndex));
    if (setId !== null) deleteSessionSetById(setId);
    onExerciseChanged();
    if (wasComplete) { setIsDecline(false); setIsUp(false); updateExercise(exercise.id, { lastTrend: exerciseInitRef.current.lastTrend }); onSetUndone(exercise.id); }
  };

  // ── Weight-prompt confirm
  const handleWeightConfirm = (newWeight: number) => {
    if (!isSingleMode && pendingSetIdx !== null) {
      if (showWeightPrompt === "increase") {
        const newSets = loggedRepsSets.map((r, i) => (i === pendingSetIdx ? pendingReps! : r));
        commitSetLog(pendingSetIdx, pendingReps!, exercise.weight, newSets);
        updateExercise(exercise.id, { weight: newWeight });
      } else {
        updateExercise(exercise.id, { weight: newWeight });
      }
      onExerciseChanged();
      setPendingReps(null);
      setPendingSetIdx(null);
      setShowWeightPrompt(null);
    } else {
      if (showWeightPrompt === "increase") {
        commitLog(pendingReps!, exercise.weight);
        updateExercise(exercise.id, { weight: newWeight, lastReps: null, lastRepsSets: null });
      } else {
        updateExercise(exercise.id, { weight: newWeight, lastReps: null, lastRepsSets: null });
      }
      onExerciseChanged();
      setPendingReps(null);
      setShowWeightPrompt(null);
    }
  };

  const handleEditSave = (data: Partial<Exercise>) => {
    if (data.category && data.category !== exercise.category) {
      onTabSwitch(data.category);
    }
    updateExercise(exercise.id, data);
    onExerciseChanged();
    setShowEdit(false);
  };

  const cardState = !isActive ? "idle" : isComplete ? "done" : "active";
  const isArchived = exercise.archived;

  const showLowerBtn = isActive && showWeightPrompt === null && (
    isSingleMode ? loggedReps === null : loggedOrder.length === 0
  );
  const hitMaxReps = isSingleMode
    ? loggedReps === exercise.maxReps
    : loggedRepsSets.some((r) => r === exercise.maxReps);

  const daysSinceLastDone = getDaysSinceLastDone(exercise.id, sessionId);

  return (
    <>
      <div
        className={`exercise-card ${cardState} ${isArchived ? "archived-card" : ""}`}
        data-testid={`exercise-card-${exercise.id}`}
      >
        {/* Row 1: name + sets label inline + edit */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
          <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, lineHeight: 1.2, minWidth: 0 }} data-testid="exercise-name">
            {exercise.name}
          </h2>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)", flexShrink: 0 }}>
            {exercise.sets} {exercise.sets === 1 ? "set" : "sets"}
          </span>
          <div style={{ flex: 1 }} />
          {daysSinceLastDone !== null && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--color-text-muted)",
                flexShrink: 0,
                opacity: 0.6
              }}
              data-testid="days-since-last-done"
            >
              {daysSinceLastDone}d
            </span>
          )}
          <button className="btn-edit" onClick={() => setShowEdit(true)} data-testid="btn-edit" aria-label="Edit exercise">
            <IconEdit />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onFavouriteToggle(); }}
            className={`btn-favourite${exercise.isFavourite ? " is-favourite" : ""}`}
            aria-label={exercise.isFavourite ? "Remove from favourites" : "Add to favourites"}
            data-testid="btn-favourite"
          >
            {exercise.isFavourite ? <IconStarFilled /> : <IconStarEmpty />}
          </button>
        </div>

        {/* Row 2: weight · reps  |  Lower btn  |  Up/Down  |  Tick */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", flex: 1, minWidth: 0 }} data-testid="exercise-weight">
            <strong style={{ color: "var(--color-text)", fontWeight: 700 }}>{exercise.weight}{settings.weightUnit}</strong>
            {isSingleMode ? (
              loggedReps !== null && <span> · {loggedReps} rep{loggedReps !== 1 ? "s" : ""}</span>
            ) : (
              loggedOrder.length > 0 && !isComplete && (
                <span style={{ color: "var(--color-text-faint)" }}> · {loggedOrder.length}/{exercise.sets} sets</span>
              )
            )}
            {exercise.tempo && <span> · tempo: {exercise.tempo}</span>}
          </p>

          {showLowerBtn && (
            <button className="btn-weight" onClick={() => setShowWeightPrompt("decrease")} data-testid="btn-decrease-weight">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
              Lower
            </button>
          )}

          {isComplete && isDecline && (
            <span data-testid="badge-down" style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 8px 2px 6px", borderRadius: "99px", background: "hsl(25 60% 18%)", border: "1px solid hsl(25 50% 30%)", color: "var(--color-warning)", fontSize: "10px", fontWeight: 700 }}>
              <IconDecline /> Down
            </span>
          )}
          {isComplete && isUp && (
            <span data-testid="badge-up" style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 8px 2px 6px", borderRadius: "99px", background: "hsl(142 50% 14%)", border: "1px solid hsl(142 40% 25%)", color: "hsl(142 70% 50%)", fontSize: "10px", fontWeight: 700 }}>
              <IconUp /> Up
            </span>
          )}
          {!isComplete && exercise.lastTrend === "down" && (
            <span data-testid="badge-last-down" style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 8px 2px 6px", borderRadius: "99px", background: "hsl(25 60% 18%)", border: "1px solid hsl(25 50% 30%)", color: "var(--color-warning)", fontSize: "10px", fontWeight: 700, opacity: 0.7 }}>
              <IconDecline /> Down
            </span>
          )}
          {!isComplete && exercise.lastTrend === "up" && (
            <span data-testid="badge-last-up" style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 8px 2px 6px", borderRadius: "99px", background: "hsl(142 50% 14%)", border: "1px solid hsl(142 40% 25%)", color: "hsl(142 70% 50%)", fontSize: "10px", fontWeight: 700, opacity: 0.7 }}>
              <IconUp /> Up
            </span>
          )}

          {isComplete && (
            <span className="done-check" data-testid="done-check">
              <IconCheck />
            </span>
          )}
        </div>

        {/* Rep bar — single mode */}
        {isSingleMode && (
          loggedReps !== null && isActive && showWeightPrompt === null ? (
            <div onClick={() => { setLoggedReps(null); setIsDecline(false); setIsUp(false); singleModeSetIdsRef.current.forEach((id) => deleteSessionSetById(id)); singleModeSetIdsRef.current = []; updateExercise(exercise.id, { lastReps: exerciseInitRef.current.lastReps, lastRepsSets: exerciseInitRef.current.lastRepsSets, lastTrend: exerciseInitRef.current.lastTrend }); onExerciseChanged(); onSetUndone(exercise.id); }} style={{ cursor: "pointer" }}>
              <RepBar exercise={exercise} isActive={false} loggedReps={loggedReps} onTap={() => {}} settings={settings} />
              <p className="undo-hint">Tap bar to undo</p>
            </div>
          ) : (
            <RepBar exercise={exercise} isActive={isActive && loggedReps === null} loggedReps={loggedReps} onTap={handleRepTap} settings={settings} />
          )
        )}

        {/* Rep bar — multi mode */}
        {!isSingleMode && (
          <RepBar
            exercise={exercise}
            isActive={isActive}
            loggedReps={null}
            loggedRepsSets={loggedRepsSets}
            onTap={() => {}}
            onTapSet={handleRepTapSet}
            onUndoSet={handleUndoSet}
            settings={settings}
          />
        )}

        {/* Weight prompt */}
        {showWeightPrompt !== null && (
          <WeightPrompt
            label={showWeightPrompt === "increase" ? "New weight:" : "New (lower) weight:"}
            weightUnit={settings.weightUnit}
            onConfirm={handleWeightConfirm}
            onCancel={() => {
              if (!isSingleMode && pendingSetIdx !== null) {
                setLoggedRepsSets((prev) => { const n = [...prev]; n[pendingSetIdx] = null; return n; });
                setPendingSetIdx(null);
              } else {
                setLoggedReps(null);
              }
              setPendingReps(null);
              setShowWeightPrompt(null);
            }}
          />
        )}

        {hitMaxReps && (
          <p style={{ marginTop: "8px", fontSize: "var(--text-xs)", color: "var(--color-success)", fontWeight: 600 }}>
            Max reps hit — weight updated for next session
          </p>
        )}
      </div>

      {showEdit && (
        <ExerciseSheet
          exercise={exercise}
          weightUnit={settings.weightUnit}
          onSave={handleEditSave}
          onClose={() => setShowEdit(false)}
          onRetireToggle={() => {
            updateExercise(exercise.id, { archived: !exercise.archived });
            onExerciseChanged();
            setShowEdit(false);
          }}
          onDelete={() => {
            deleteExercise(exercise.id);
            onExerciseChanged();
            setShowEdit(false);
          }}
          onTabSwitch={onTabSwitch}
        />
      )}
    </>
  );
}

// ─── Sortable Exercise Card Wrapper ─────────────────────────────────────────────

export function SortableExerciseCard({ exercise, isReordering, isDropped, isActive, sessionId, onSetLogged, onSetUndone, onExerciseChanged, onTabSwitch, onFavouriteToggle, settings }: {
  exercise: Exercise;
  isReordering: boolean;
  isDropped: boolean;
  isActive: boolean;
  sessionId: number | null;
  onSetLogged: (log: SetLog) => void;
  onSetUndone: (exerciseId: number) => void;
  onExerciseChanged: () => void;
  onTabSwitch: (cat: string) => void;
  onFavouriteToggle: () => void;
  settings: Settings;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id });

  const outerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  const innerClass = isDragging
    ? "exercise-drag-active"
    : isDropped
      ? "exercise-drop-confirm"
      : isReordering
        ? "exercise-jiggling"
        : undefined;

  return (
    <div ref={setNodeRef} style={outerStyle} className="exercise-sortable" data-exercise-id={exercise.id} {...attributes} {...listeners}>
      <div className={innerClass}>
        <ExerciseCard
          exercise={exercise}
          isActive={isActive && !isReordering}
          sessionId={sessionId}
          onSetLogged={onSetLogged}
          onSetUndone={onSetUndone}
          onExerciseChanged={onExerciseChanged}
          onTabSwitch={onTabSwitch}
          onFavouriteToggle={onFavouriteToggle}
          settings={settings}
        />
      </div>
    </div>
  );
}

