import { useEffect, useState } from "react";
import {
  type CoachExerciseNote,
  type CoachNotes,
  fetchCoachNotes,
  isForToday,
  loadCachedCoachNotesForToday,
} from "@/lib/coachNotes";

/**
 * Coach notes for today, or null. Starts from the localStorage cache (so notes
 * show instantly and offline), then refreshes in the background whenever the
 * feature is enabled, the app loads, or `refreshKey` (the session) changes.
 * When disabled it returns null and never fetches.
 */
export function useCoachNotes(enabled: boolean, refreshKey: unknown): CoachNotes | null {
  const [notes, setNotes] = useState<CoachNotes | null>(() => (enabled ? loadCachedCoachNotesForToday() : null));

  useEffect(() => {
    if (!enabled) {
      setNotes(null);
      return;
    }
    let cancelled = false;
    setNotes(loadCachedCoachNotesForToday());
    fetchCoachNotes().then((fetched) => {
      if (cancelled) return;
      setNotes(isForToday(fetched) ? fetched : loadCachedCoachNotesForToday());
    });
    return () => { cancelled = true; };
  }, [enabled, refreshKey]);

  // Re-check the date at render time so notes vanish after midnight (London).
  return enabled && isForToday(notes) ? notes : null;
}

const coachLabelStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: "9px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "hsl(265 60% 75%)",
  background: "hsl(265 35% 18%)",
  border: "1px solid hsl(265 30% 30%)",
  borderRadius: "4px",
  padding: "1px 5px",
  marginRight: "6px",
  verticalAlign: "1px",
  flexShrink: 0,
};

export function CoachSessionBanner({ notes }: { notes: CoachNotes }) {
  const session = notes.session;
  if (!session) return null;
  return (
    <div
      data-testid="coach-session-banner"
      style={{
        borderRadius: "12px",
        padding: "8px 12px",
        background: "hsl(265 25% 12%)",
        border: "1px solid hsl(265 25% 24%)",
        fontSize: "12px",
        lineHeight: 1.5,
        color: "var(--color-text-muted)",
      }}
    >
      <span style={coachLabelStyle}>Coach</span>
      {session.focus && (
        <strong style={{ color: "var(--color-text)", fontWeight: 700 }} data-testid="coach-session-focus">
          {session.focus}
        </strong>
      )}
      {session.focus && session.note && <span> · </span>}
      {session.note && <span data-testid="coach-session-note">{session.note}</span>}
    </div>
  );
}

export function CoachExerciseNoteLine({ note }: { note: CoachExerciseNote }) {
  return (
    <div
      data-testid="coach-exercise-note"
      style={{
        marginTop: "8px",
        paddingTop: "6px",
        borderTop: "1px dashed var(--color-border)",
        fontSize: "12px",
        lineHeight: 1.5,
        color: "var(--color-text-muted)",
      }}
    >
      <span style={coachLabelStyle}>Coach</span>
      {note.target && (
        <strong style={{ color: "hsl(265 60% 80%)", fontWeight: 700 }} data-testid="coach-exercise-target">
          {note.target}
        </strong>
      )}
      {note.target && note.note && <span> · </span>}
      {note.note && <span data-testid="coach-exercise-note-text">{note.note}</span>}
    </div>
  );
}
