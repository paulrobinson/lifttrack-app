import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type Exercise,
  type Session,
  initStorage,
  resetExercises,
  replaceExercises,
  getExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  saveExercisesOrder,
  getActiveSession,
  startSession,
  endSession,
  logSet,
  undoSet,
  getCategories,
  addCategory,
} from "@/lib/storage";

// ─── Constants ───────────────────────────────────────────────────────────────

const ARCHIVE_TAB = "Archive";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetLog {
  exerciseId: number;
  exerciseName: string;
  repsAchieved: number;
  isDecline: boolean;
  isUp: boolean;
  weight: number;
  sets: number;
}

// ─── Import Parser ──────────────────────────────────────────────────────────────

type ParsedExercise = Omit<Exercise, "id">;

interface ParseError {
  lineIndex: number; // 0-based
  message: string;
  lines: string[];
}

type ParseResult =
  | { ok: true; exercises: ParsedExercise[] }
  | { ok: false; error: ParseError };

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

export function parseImportText(text: string): ParseResult {
  const raw = text.split("\n");
  // Strip trailing empty lines
  const lines = raw.map((l) => l.trim());

  const exercises: ParsedExercise[] = [];
  let currentCategory: string | null = null;
  let i = 0;
  let sortOrder = 0;

  const fail = (lineIndex: number, message: string): ParseResult => ({
    ok: false,
    error: { lineIndex, message, lines: raw },
  });

  const isDivider = (s: string) => /^—{3,}$/.test(s) || /^-{3,}$/.test(s);
  const isFieldLine = (s: string) => /^exercise\s*:/i.test(s) || /^max reps\s*:/i.test(s) || /^weight\s*:/i.test(s) || /^sets\s*:/i.test(s) || /^reps\s*:/i.test(s);

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines and dividers between categories / between exercises
    if (line === "" || isDivider(line)) { i++; continue; }

    // If it looks like a field line, we're missing a category header
    if (isFieldLine(line)) {
      if (!currentCategory) return fail(i, "Found exercise fields before a category name was declared.");
    }

    // Check if this is a category header (a non-field, non-divider, non-blank line
    // that precedes exercise blocks, or comes after a divider)
    if (!isFieldLine(line)) {
      currentCategory = line;
      i++;
      continue;
    }

    // --- Parse an exercise block ---
    // Collect all field lines until next blank/divider/category
    const blockStart = i;
    const fields: Record<string, string> = {};

    while (i < lines.length) {
      const l = lines[i];
      if (l === "" || isDivider(l)) break;
      // If it looks like a new category (no colon), break
      if (!isFieldLine(l)) break;

      const colonIdx = l.indexOf(":");
      if (colonIdx === -1) return fail(i, `Expected "Key : Value" but got: "${l}"`);
      const key = l.slice(0, colonIdx).trim().toLowerCase().replace(/\s+/g, " ");
      const val = l.slice(colonIdx + 1).trim();
      fields[key] = val;
      i++;
    }

    // Validate required fields
    const req = ["exercise", "max reps", "weight", "sets", "reps"];
    for (const r of req) {
      if (!fields[r]) return fail(blockStart, `Missing "${r}" field in exercise block.`);
    }

    const name = fields["exercise"];
    const maxReps = parseInt(fields["max reps"]);
    // Weight: strip non-numeric suffixes ("60kg" -> 60), handle "0" for bodyweight
    const weight = parseFloat(fields["weight"].replace(/[^\d.]/g, "") || "0");
    const sets = parseInt(fields["sets"]);
    // Reps might be "8" or "8, 8, 8" or "8, 6" — take the first number
    const repsRaw = fields["reps"].split(/[,\s]+/)[0];
    const lastReps = parseInt(repsRaw);

    if (isNaN(maxReps)) return fail(blockStart, `"max reps" value "${fields["max reps"]}" is not a number.`);
    if (isNaN(weight)) return fail(blockStart, `"weight" value "${fields["weight"]}" is not a number.`);
    if (isNaN(sets))   return fail(blockStart, `"sets" value "${fields["sets"]}" is not a number.`);
    if (isNaN(lastReps)) return fail(blockStart, `"reps" value "${fields["reps"]}" could not be parsed as a number.`);

    exercises.push({
      name,
      category: currentCategory!,
      weight,
      maxReps,
      sets,
      lastReps,
      sortOrder: sortOrder++,
      archived: false,
    });
  }

  if (exercises.length === 0) {
    return { ok: false, error: { lineIndex: 0, message: "No exercises found in file.", lines: raw } };
  }

  return { ok: true, exercises };
}

// ─── Import Button ────────────────────────────────────────────────────────────

type ImportStep = "idle" | "warn" | "choose" | "paste" | "error" | "confirm";

function ImportButton({ onImport }: { onImport: () => void }) {
  const [step, setStep] = useState<ImportStep>("idle");
  const [parseError, setParseError] = useState<ParseError | null>(null);
  const [parsed, setParsed] = useState<ParsedExercise[] | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const reset = () => { setStep("idle"); setParseError(null); setParsed(null); setPasteValue(""); setDecodeError(null); };

  const handleParsed = (exercises: ParsedExercise[]) => {
    setParsed(exercises);
    setStep("confirm");
  };

  const openFilePicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,text/plain";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = parseImportText(text);
      if (!result.ok) {
        setParseError(result.error);
        setStep("error");
      } else {
        handleParsed(result.exercises);
      }
    };
    input.click();
  };

  const handlePasteImport = async () => {
    setDecodeError(null);
    try {
      const exercises = await decodeState(pasteValue.trim());
      if (!Array.isArray(exercises) || exercises.length === 0) throw new Error("No exercises found in transfer code.");
      handleParsed(exercises as ParsedExercise[]);
    } catch (e: unknown) {
      setDecodeError(e instanceof Error ? e.message : "Could not decode transfer code. Make sure you copied the full code.");
    }
  };

  // Group summary for confirm screen
  const groupSummary = parsed
    ? Object.entries(
        parsed.reduce<Record<string, number>>((acc, ex) => {
          acc[ex.category] = (acc[ex.category] ?? 0) + 1;
          return acc;
        }, {})
      )
    : [];

  // Error snippet: 3 lines either side
  const ErrorDisplay = () => {
    if (!parseError) return null;
    const { lineIndex, message, lines } = parseError;
    const from = Math.max(0, lineIndex - 3);
    const to = Math.min(lines.length - 1, lineIndex + 3);
    const snippet = lines.slice(from, to + 1);
    return (
      <div style={{ marginTop: "12px", borderRadius: "10px", overflow: "hidden", border: "1px solid hsl(0 50% 30%)" }}>
        <div style={{ background: "hsl(0 40% 8%)", padding: "10px 12px", fontFamily: "monospace", fontSize: "11px", lineHeight: 1.7 }}>
          {snippet.map((l, idx) => {
            const absIdx = from + idx;
            const isOffending = absIdx === lineIndex;
            return (
              <div key={absIdx} style={{
                color: isOffending ? "hsl(0 80% 65%)" : "var(--color-text-muted)",
                fontWeight: isOffending ? 700 : 400,
                background: isOffending ? "hsl(0 40% 14%)" : "transparent",
                padding: "0 6px", borderRadius: "4px",
                display: "flex", gap: "8px",
              }}>
                <span style={{ opacity: 0.4, minWidth: "24px" }}>{absIdx + 1}</span>
                <span>{l || "\u00a0"}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (step === "warn") {
    return (
      <Modal onClose={reset}>
        <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginBottom: "8px" }}>Import exercises</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: "20px" }}>
          Importing will <strong style={{ color: "hsl(0 70% 65%)" }}>replace all your current exercises</strong>. If you want to keep them, use the Export button first to save a copy.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            style={{ width: "100%", padding: "12px", borderRadius: "99px", border: "none", cursor: "pointer", background: "var(--color-success)", color: "#000", fontWeight: 700, fontSize: "var(--text-sm)" }}
            onClick={() => setStep("choose")}
          >
            Continue
          </button>
          <button onClick={reset} style={cancelBtnStyle}>Cancel</button>
        </div>
      </Modal>
    );
  }

  if (step === "choose") {
    return (
      <Modal onClose={reset}>
        <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginBottom: "6px" }}>Choose import method</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: "20px" }}>
          Upload a text file, or paste a transfer code copied from another device.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            style={{ width: "100%", padding: "12px", borderRadius: "99px", border: "1px solid var(--color-border)", cursor: "pointer", background: "var(--color-surface-2, hsl(220 12% 18%))", color: "var(--color-text)", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            onClick={() => { setStep("idle"); openFilePicker(); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Upload file
          </button>
          <button
            style={{ width: "100%", padding: "12px", borderRadius: "99px", border: "none", cursor: "pointer", background: "var(--color-success)", color: "#000", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            onClick={() => setStep("paste")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Paste transfer code
          </button>
          <button onClick={reset} style={cancelBtnStyle}>Cancel</button>
        </div>
      </Modal>
    );
  }

  if (step === "paste") {
    return (
      <Modal onClose={reset}>
        <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginBottom: "6px" }}>Paste transfer code</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: "12px" }}>
          Paste the code you copied from another device using the Export button.
        </p>
        <textarea
          autoFocus
          value={pasteValue}
          onChange={(e) => { setPasteValue(e.target.value); setDecodeError(null); }}
          placeholder="Paste your transfer code here..."
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 12px", borderRadius: "10px",
            border: `1px solid ${decodeError ? "hsl(0 50% 40%)" : "var(--color-border)"}`,
            background: "hsl(220 14% 9%)", color: "var(--color-text)",
            fontFamily: "monospace", fontSize: "11px", lineHeight: 1.5,
            resize: "none", height: "100px", outline: "none",
          }}
        />
        {decodeError && (
          <p style={{ fontSize: "11px", color: "hsl(0 70% 65%)", marginTop: "6px", lineHeight: 1.5 }}>{decodeError}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
          <button
            disabled={!pasteValue.trim()}
            onClick={handlePasteImport}
            style={{ width: "100%", padding: "12px", borderRadius: "99px", border: "none", cursor: pasteValue.trim() ? "pointer" : "not-allowed", background: pasteValue.trim() ? "var(--color-success)" : "hsl(220 12% 18%)", color: pasteValue.trim() ? "#000" : "var(--color-text-muted)", fontWeight: 700, fontSize: "var(--text-sm)", opacity: pasteValue.trim() ? 1 : 0.5 }}
          >
            Import
          </button>
          <button onClick={() => setStep("choose")} style={cancelBtnStyle}>Back</button>
        </div>
      </Modal>
    );
  }

  if (step === "error") {
    return (
      <Modal onClose={reset}>
        <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginBottom: "6px", color: "hsl(0 70% 65%)" }}>Parse error</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
          Line {(parseError?.lineIndex ?? 0) + 1}: {parseError?.message}
        </p>
        <ErrorDisplay />
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" }}>
          <button
            style={{ width: "100%", padding: "12px", borderRadius: "99px", border: "none", cursor: "pointer", background: "var(--color-surface-2, hsl(220 12% 18%))", color: "var(--color-text)", fontWeight: 700, fontSize: "var(--text-sm)" }}
            onClick={() => { setParseError(null); setStep("choose"); }}
          >
            Try again
          </button>
          <button onClick={reset} style={cancelBtnStyle}>Cancel</button>
        </div>
      </Modal>
    );
  }

  if (step === "confirm") {
    return (
      <Modal onClose={reset}>
        <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginBottom: "8px" }}>Confirm import</p>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: "14px" }}>
          Found <strong style={{ color: "var(--color-text)" }}>{parsed!.length} exercise{parsed!.length !== 1 ? "s" : ""}</strong> across {groupSummary.length} group{groupSummary.length !== 1 ? "s" : ""}:
        </p>
        <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {groupSummary.map(([cat, count]) => (
            <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", background: "var(--color-surface-2, hsl(220 12% 18%))", borderRadius: "8px", padding: "7px 12px" }}>
              <span style={{ fontWeight: 600 }}>{cat}</span>
              <span style={{ color: "var(--color-text-muted)" }}>{count} exercise{count !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: "11px", color: "hsl(0 70% 65%)", marginBottom: "16px" }}>This will replace your current exercises. This cannot be undone.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            style={{ width: "100%", padding: "12px", borderRadius: "99px", border: "none", cursor: "pointer", background: "var(--color-success)", color: "#000", fontWeight: 700, fontSize: "var(--text-sm)" }}
            onClick={() => { replaceExercises(parsed!); onImport(); reset(); }}
          >
            Import {parsed!.length} exercises
          </button>
          <button onClick={reset} style={cancelBtnStyle}>Cancel</button>
        </div>
      </Modal>
    );
  }

  return (
    <div style={{ textAlign: "center", marginBottom: "12px" }}>
      <button
        onClick={() => setStep("warn")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: "11px", color: "var(--color-text-faint)",
          textDecoration: "underline", textUnderlineOffset: "3px",
          opacity: 0.5,
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
        onMouseLeave={(e) => e.currentTarget.style.opacity = "0.5"}
      >
        Import exercises
      </button>
    </div>
  );
}

const cancelBtnStyle: React.CSSProperties = {
  width: "100%", padding: "12px",
  background: "none", border: "1px solid var(--color-border)",
  borderRadius: "99px", cursor: "pointer",
  color: "var(--color-text-muted)", fontWeight: 600,
  fontSize: "var(--text-sm)",
};

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "hsl(220 14% 13%)",
        border: "1px solid var(--color-border)",
        borderRadius: "20px",
        padding: "28px 24px",
        width: "100%",
        maxWidth: "360px",
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Reset Button ───────────────────────────────────────────────────────────────

function ResetButton({ onReset }: { onReset: () => void }) {
  const [step, setStep] = useState<"idle" | "confirm">("idle");

  if (step === "confirm") {
    return (
      <div style={{
        margin: "40px 0 24px",
        padding: "14px 16px",
        borderRadius: "12px",
        border: "1px solid hsl(0 50% 30%)",
        background: "hsl(0 40% 10%)",
        fontSize: "var(--text-xs)",
      }}>
        <p style={{ fontWeight: 700, color: "hsl(0 70% 65%)", marginBottom: "6px" }}>Reset exercises?</p>
        <p style={{ color: "var(--color-text-muted)", lineHeight: 1.5, marginBottom: "12px" }}>
          This will delete all your exercises and restore the defaults. Your session history is not affected.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => { resetExercises(); onReset(); setStep("idle"); }}
            style={{
              flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer",
              background: "hsl(0 60% 40%)", color: "#fff", fontWeight: 700,
              fontSize: "var(--text-xs)",
            }}
          >
            Yes, reset
          </button>
          <button
            onClick={() => setStep("idle")}
            style={{
              flex: 1, padding: "8px", borderRadius: "8px", cursor: "pointer",
              background: "none", border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)", fontWeight: 600,
              fontSize: "var(--text-xs)",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", margin: "40px 0 24px" }}>
      <button
        onClick={() => setStep("confirm")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: "11px", color: "var(--color-text-faint)",
          textDecoration: "underline", textUnderlineOffset: "3px",
          opacity: 0.5,
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
        onMouseLeave={(e) => e.currentTarget.style.opacity = "0.5"}
      >
        Reset exercises to defaults
      </button>
    </div>
  );
}

// ─── Encode / Decode state string ────────────────────────────────────────────
// gzip-compress JSON, then base64url (A-Za-z0-9-_), no padding.
// Safe for WhatsApp, Word, SMS — no special characters.

export async function encodeState(exercises: Exercise[]): Promise<string> {
  const json = JSON.stringify(exercises);
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function decodeState(encoded: string): Promise<Exercise[]> {
  const b64 = encoded.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const decompressed = await new Response(ds.readable).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(decompressed)) as Exercise[];
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function buildExportText(exercises: Exercise[]): string {
  const active = exercises.filter((e) => !e.archived);
  const seen: string[] = [];
  active.forEach((e) => { if (!seen.includes(e.category)) seen.push(e.category); });
  const lines: string[] = [];
  for (const group of seen) {
    const exs = active.filter((e) => e.category === group);
    lines.push(group);
    lines.push("\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014");
    exs.forEach((e, i) => {
      lines.push(`Exercise : ${e.name}`);
      lines.push(`Max reps : ${e.maxReps}`);
      lines.push(`Weight : ${e.weight}`);
      lines.push(`Sets : ${e.sets}`);
      lines.push(`Reps : ${e.lastReps ?? "\u2013"}`);
      if (i < exs.length - 1) lines.push("\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014");
    });
    lines.push("");
  }
  return lines.join("\n");
}

function ExportModal({ exercises, onClose }: { exercises: Exercise[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [encoding, setEncoding] = useState(false);

  const handleDownload = () => {
    const text = buildExportText(exercises);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lifttrack-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    setEncoding(true);
    try {
      const encoded = await encodeState(exercises);
      await navigator.clipboard.writeText(encoded);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setEncoding(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginBottom: "6px" }}>Export exercises</p>
      <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: "20px" }}>
        Download a readable text file, or copy a compact transfer code you can paste into WhatsApp, Notes, or another browser.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <button
          onClick={handleDownload}
          style={{ width: "100%", padding: "12px", borderRadius: "99px", border: "1px solid var(--color-border)", cursor: "pointer", background: "var(--color-surface-2, hsl(220 12% 18%))", color: "var(--color-text)", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download as file
        </button>
        <button
          onClick={handleCopy}
          disabled={encoding}
          style={{ width: "100%", padding: "12px", borderRadius: "99px", border: "none", cursor: encoding ? "wait" : "pointer", background: copied ? "hsl(142 50% 20%)" : "var(--color-success)", color: copied ? "var(--color-success)" : "#000", fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "background 300ms, color 300ms" }}
        >
          {copied ? (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> Copied!</>
          ) : encoding ? "Encoding\u2026" : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>Copy transfer code</>
          )}
        </button>
        <button onClick={onClose} style={cancelBtnStyle}>Close</button>
      </div>
    </Modal>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}


function IconDecline() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M17 17h4V13" />
    </svg>
  );
}

function IconUp() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M17 7h4v4" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconArchive() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

// ─── Rep Bar ─────────────────────────────────────────────────────────────────

function RepBar({ exercise, isActive, loggedReps, onTap }: {
  exercise: Exercise; isActive: boolean; loggedReps: number | null; onTap: (r: number) => void;
}) {
  const { maxReps, lastReps } = exercise;
  const squares = Array.from({ length: maxReps }, (_, i) => i + 1);

  const getState = (rep: number) => {
    if (loggedReps !== null) return rep <= loggedReps ? "filled" : "empty";
    return rep <= (lastReps ?? 0) ? "reference" : "empty";
  };

  const showLabel = (rep: number) => {
    if (rep === maxReps) return true;
    if (loggedReps !== null && rep === loggedReps && rep !== maxReps) return true;
    if (loggedReps === null && rep === (lastReps ?? 0) && rep !== maxReps) return true;
    return false;
  };

  return (
    <div className="rep-bar" data-testid="rep-bar">
      {squares.map((rep) => {
        const state = getState(rep);
        const tappable = isActive && loggedReps === null;
        return (
          <button
            key={rep}
            className={`rep-square ${state} ${tappable ? "tappable" : ""}`}
            onClick={tappable ? () => onTap(rep) : undefined}
            aria-label={`${rep} rep${rep !== 1 ? "s" : ""}`}
            data-testid={`rep-square-${rep}`}
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

// ─── Weight Prompt ────────────────────────────────────────────────────────────

function WeightPrompt({ label, onConfirm, onCancel }: {
  label: string; onConfirm: (w: number) => void; onCancel: () => void;
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
      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>kg</span>
      <button className="btn-confirm" onClick={confirm} data-testid="weight-prompt-confirm">✓</button>
      <button className="btn-cancel-prompt" onClick={onCancel} data-testid="weight-prompt-cancel">✕</button>
    </div>
  );
}

// ─── Add Category Dialog ──────────────────────────────────────────────────────

function AddCategoryDialog({ existingCategories, onAdd, onClose }: {
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

// ─── Edit / Add Sheet ─────────────────────────────────────────────────────────

function ExerciseSheet({ exercise, defaultCategory, onSave, onClose, onArchiveToggle, onDelete, onTabSwitch }: {
  exercise?: Exercise;
  defaultCategory?: string;
  onSave: (data: Partial<Exercise>) => void;
  onClose: () => void;
  onArchiveToggle?: () => void;
  onDelete?: () => void;
  onTabSwitch?: (cat: string) => void;
}) {
  const isNew = !exercise;
  const sheetCategories = getCategories();
  const [name, setName] = useState(exercise?.name ?? "");
  const [weight, setWeight] = useState(String(exercise?.weight ?? ""));
  const [maxReps, setMaxReps] = useState(String(exercise?.maxReps ?? "12"));
  const [sets, setSets] = useState(String(exercise?.sets ?? "3"));
  const [category, setCategory] = useState<string>(exercise?.category ?? defaultCategory ?? sheetCategories[0] ?? "Back");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    const data: Partial<Exercise> = {
      name: name.trim() || exercise?.name || "New Exercise",
      weight: parseFloat(weight) || exercise?.weight || 0,
      maxReps: parseInt(maxReps) || exercise?.maxReps || 12,
      sets: parseInt(sets) || exercise?.sets || 3,
      category,
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="edit-field">
            <label>Weight (kg)</label>
            <input type="number" inputMode="decimal" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="30" data-testid="edit-weight" />
          </div>
          <div className="edit-field">
            <label>Max Reps</label>
            <input type="number" inputMode="numeric" value={maxReps} onChange={(e) => setMaxReps(e.target.value)} data-testid="edit-max-reps" />
          </div>
          <div className="edit-field">
            <label>Sets</label>
            <input type="number" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} data-testid="edit-sets" />
          </div>
          <div className="edit-field">
            <label>Group</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="edit-category">
              {sheetCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
          <button className="btn-confirm" style={{ flex: 1, borderRadius: "12px", padding: "12px" }} onClick={handleSave} data-testid="edit-save">
            {isNew ? "Add Exercise" : "Save Changes"}
          </button>
          <button className="btn-cancel-prompt" style={{ padding: "12px 16px", borderRadius: "12px" }} onClick={onClose}>
            Cancel
          </button>
        </div>

        {!isNew && onArchiveToggle && (
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              onClick={onArchiveToggle}
              style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "var(--text-xs)", fontWeight: 600, color: exercise?.archived ? "var(--color-success)" : "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
              data-testid="btn-archive-toggle"
            >
              <IconArchive />
              {exercise?.archived ? "Unarchive" : "Archive exercise"}
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

// ─── Session Summary ──────────────────────────────────────────────────────────

function SessionSummary({ logs, onClose }: { logs: SetLog[]; onClose: () => void }) {
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
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginLeft: "5px" }}>×{log.sets}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                  {log.weight}kg × {log.repsAchieved}
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

// ─── Exercise Card ────────────────────────────────────────────────────────────

function ExerciseCard({ exercise, isActive, sessionId, onSetLogged, onSetUndone, onExerciseChanged, onTabSwitch }: {
  exercise: Exercise;
  isActive: boolean;
  sessionId: number | null;
  onSetLogged: (log: SetLog) => void;
  onSetUndone: (exerciseId: number) => void;
  onExerciseChanged: () => void;
  onTabSwitch: (cat: string) => void;
}) {
  const [loggedReps, setLoggedReps] = useState<number | null>(null);
  const [isDecline, setIsDecline] = useState(false);
  const [isUp, setIsUp] = useState(false);
  const [showWeightPrompt, setShowWeightPrompt] = useState<"increase" | "decrease" | null>(null);
  const [pendingReps, setPendingReps] = useState<number | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const computeOutcome = (reps: number, weight: number) =>
    computeSetOutcome(reps, weight, exercise.lastReps, exercise.weight);

  const commitLog = (reps: number, weight: number) => {
    if (!sessionId) return;
    const { decline, up } = computeOutcome(reps, weight);
    setLoggedReps(reps);
    setIsDecline(decline);
    setIsUp(up);
    logSet({ sessionId, exerciseId: exercise.id, weight, repsAchieved: reps });
    onExerciseChanged();
    onSetLogged({ exerciseId: exercise.id, exerciseName: exercise.name, repsAchieved: reps, isDecline: decline, isUp: up, weight, sets: exercise.sets });
  };

  const handleRepTap = (reps: number) => {
    if (!isActive || !sessionId) return;
    if (loggedReps !== null) {
      // Undo
      setLoggedReps(null); setIsDecline(false); setIsUp(false);
      undoSet(sessionId, exercise.id);
      onExerciseChanged();
      onSetUndone(exercise.id);
      return;
    }
    if (reps === exercise.maxReps) {
      // Flash green first, then show weight prompt after a short delay
      setLoggedReps(reps);
      setPendingReps(reps);
      setTimeout(() => setShowWeightPrompt("increase"), 350);
    } else {
      commitLog(reps, exercise.weight);
    }
  };

  const handleWeightConfirm = (newWeight: number) => {
    if (showWeightPrompt === "increase") {
      // loggedReps already flashed green; commit the actual log then update weight
      commitLog(pendingReps!, exercise.weight);
      updateExercise(exercise.id, { weight: newWeight, lastReps: null });
    } else {
      updateExercise(exercise.id, { weight: newWeight, lastReps: null });
    }
    onExerciseChanged();
    setPendingReps(null);
    setShowWeightPrompt(null);
  };

  const handleEditSave = (data: Partial<Exercise>) => {
    if (data.category && data.category !== exercise.category) {
      onTabSwitch(data.category);
    }
    updateExercise(exercise.id, data);
    onExerciseChanged();
    setShowEdit(false);
  };

  const cardState = !isActive ? "idle" : loggedReps !== null ? "done" : "active";
  const isArchived = exercise.archived;

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
            ×{exercise.sets}
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn-edit" onClick={() => setShowEdit(true)} data-testid="btn-edit" aria-label="Edit exercise">
            <IconEdit />
          </button>
        </div>

        {/* Row 2: weight · reps  |  Lower btn  |  Up/Down  |  Tick */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", flex: 1, minWidth: 0 }} data-testid="exercise-weight">
            <strong style={{ color: "var(--color-text)", fontWeight: 700 }}>{exercise.weight}kg</strong>
            {loggedReps !== null && (
              <span> · {loggedReps} rep{loggedReps !== 1 ? "s" : ""}</span>
            )}
          </p>

          {isActive && loggedReps === null && showWeightPrompt === null && (
            <button className="btn-weight" onClick={() => setShowWeightPrompt("decrease")} data-testid="btn-decrease-weight">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
              Lower
            </button>
          )}

          {loggedReps !== null && isDecline && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 8px 2px 6px", borderRadius: "99px", background: "hsl(25 60% 18%)", border: "1px solid hsl(25 50% 30%)", color: "var(--color-warning)", fontSize: "10px", fontWeight: 700 }}>
              <IconDecline /> Down
            </span>
          )}
          {loggedReps !== null && isUp && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 8px 2px 6px", borderRadius: "99px", background: "hsl(142 50% 14%)", border: "1px solid hsl(142 40% 25%)", color: "hsl(142 70% 50%)", fontSize: "10px", fontWeight: 700 }}>
              <IconUp /> Up
            </span>
          )}

          {loggedReps !== null && (
            <span className="done-check" data-testid="done-check">
              <IconCheck />
            </span>
          )}
        </div>

        {/* Rep bar */}
        {loggedReps !== null && isActive && showWeightPrompt === null ? (
          <div onClick={() => { setLoggedReps(null); setIsDecline(false); setIsUp(false); undoSet(sessionId!, exercise.id); onExerciseChanged(); onSetUndone(exercise.id); }} style={{ cursor: "pointer" }}>
            <RepBar exercise={exercise} isActive={false} loggedReps={loggedReps} onTap={() => {}} />
            <p className="undo-hint">Tap bar to undo</p>
          </div>
        ) : (
          <RepBar exercise={exercise} isActive={isActive && loggedReps === null} loggedReps={loggedReps} onTap={handleRepTap} />
        )}

        {/* Weight prompt */}
        {showWeightPrompt !== null && (
          <WeightPrompt
            label={showWeightPrompt === "increase" ? "New weight:" : "New (lower) weight:"}
            onConfirm={handleWeightConfirm}
            onCancel={() => { setLoggedReps(null); setPendingReps(null); setShowWeightPrompt(null); }}
          />
        )}

        {loggedReps === exercise.maxReps && (
          <p style={{ marginTop: "8px", fontSize: "var(--text-xs)", color: "var(--color-success)", fontWeight: 600 }}>
            Max reps hit — weight updated for next session
          </p>
        )}
      </div>

      {showEdit && (
        <ExerciseSheet
          exercise={exercise}
          onSave={handleEditSave}
          onClose={() => setShowEdit(false)}
          onArchiveToggle={() => {
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

// ─── Sortable Exercise Card Wrapper ───────────────────────────────────────────

function SortableExerciseCard({ exercise, isReordering, isDropped, isActive, sessionId, onSetLogged, onSetUndone, onExerciseChanged, onTabSwitch }: {
  exercise: Exercise;
  isReordering: boolean;
  isDropped: boolean;
  isActive: boolean;
  sessionId: number | null;
  onSetLogged: (log: SetLog) => void;
  onSetUndone: (exerciseId: number) => void;
  onExerciseChanged: () => void;
  onTabSwitch: (cat: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id });

  // Outer div: only handles @dnd-kit's translate transform for live reordering.
  // The jiggle animation must NOT live here — its `transform: rotate()` would
  // override the translate3d that @dnd-kit sets via inline style.
  const outerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  // Inner div: safe to apply rotate-based jiggle and drop-confirm here.
  const innerClass = isDragging
    ? "exercise-drag-active"
    : isDropped
      ? "exercise-drop-confirm"
      : isReordering
        ? "exercise-jiggling"
        : undefined;

  return (
    <div ref={setNodeRef} style={outerStyle} className="exercise-sortable" {...attributes} {...listeners}>
      <div className={innerClass}>
        <ExerciseCard
          exercise={exercise}
          isActive={isActive && !isReordering}
          sessionId={sessionId}
          onSetLogged={onSetLogged}
          onSetUndone={onSetUndone}
          onExerciseChanged={onExerciseChanged}
          onTabSwitch={onTabSwitch}
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiftTracker() {
  // Init storage on first load
  useEffect(() => { initStorage(); }, []);

  const [exercises, setExercises] = useState<Exercise[]>(() => {
    initStorage();
    return getExercises();
  });
  const [categories, setCategories] = useState<string[]>(() => {
    initStorage();
    return getCategories();
  });
  const [activeSession, setActiveSession] = useState<Session | null>(() => getActiveSession());
  const [setLogs, setSetLogs] = useState<SetLog[]>([]);
  const [activeTab, setActiveTab] = useState<string>(() => getCategories()[0] ?? "Back");
  const [showSummary, setShowSummary] = useState(false);
  const [summaryLogs, setSummaryLogs] = useState<SetLog[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showAddCategoryDialog, setShowAddCategoryDialog] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [droppedId, setDroppedId] = useState<number | null>(null);

  // Sensors: long-press (500 ms hold, ≤5 px movement) activates drag
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  // Re-read exercises from localStorage whenever something changes
  const refreshExercises = useCallback(() => {
    setExercises(getExercises());
  }, []);

  const refreshCategories = useCallback(() => {
    setCategories(getCategories());
  }, []);

  const isActive = !!activeSession && !activeSession.endedAt;

  const handleStartSession = () => {
    const session = startSession();
    setActiveSession(session);
    setSetLogs([]);
  };

  const handleEndSession = () => {
    if (!activeSession) return;
    endSession(activeSession.id);
    setSummaryLogs([...setLogs]);
    setShowSummary(true);
    setActiveSession(null);
    refreshExercises();
  };

  const handleAddExercise = (data: Partial<Exercise>) => {
    const category = data.category ?? categories[0] ?? "Back";
    const catExercises = exercises.filter((ex) => ex.category === category && !ex.archived);
    const maxSortOrder = catExercises.length > 0 ? Math.max(...catExercises.map((ex) => ex.sortOrder)) : -1;
    const ex = createExercise({
      name: data.name ?? "New Exercise",
      category,
      weight: data.weight ?? 0,
      maxReps: data.maxReps ?? 12,
      sets: data.sets ?? 3,
      lastReps: null,
      sortOrder: maxSortOrder + 1,
      archived: false,
    });
    refreshExercises();
    setActiveTab(ex.category);
    setShowAddSheet(false);
  };

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    setIsReordering(true);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setIsReordering(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setExercises((prev) => {
      const catItems = prev
        .filter((ex) => ex.category === activeTab && !ex.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const oldIndex = catItems.findIndex((ex) => ex.id === active.id);
      const newIndex = catItems.findIndex((ex) => ex.id === over.id);
      const reordered = arrayMove(catItems, oldIndex, newIndex);
      saveExercisesOrder(reordered.map((ex) => ex.id));
      return getExercises();
    });
    // Flash the dropped card green so the user can see where it landed
    const droppedExId = active.id as number;
    setDroppedId(droppedExId);
    setTimeout(() => setDroppedId(null), 700);
  }, [activeTab]);

  const handleSetLogged = useCallback((log: SetLog) => {
    setSetLogs((prev) => [...prev.filter((l) => l.exerciseId !== log.exerciseId), log]);
  }, []);

  const handleSetUndone = useCallback((exerciseId: number) => {
    setSetLogs((prev) => prev.filter((l) => l.exerciseId !== exerciseId));
  }, []);

  const doneCount = setLogs.length;

  const activeExercises = exercises.filter((ex) => !ex.archived);
  const archivedExercises = exercises.filter((ex) => ex.archived);

  // All stored categories, plus any extra ones found in exercises (e.g. after import)
  const allCategories = [...categories];
  activeExercises.forEach((ex) => {
    if (!allCategories.some((c) => c.toLowerCase() === ex.category.toLowerCase())) {
      allCategories.push(ex.category);
    }
  });

  const filteredExercises = (activeTab === ARCHIVE_TAB
    ? archivedExercises
    : activeExercises.filter((ex) => ex.category === activeTab))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ minHeight: "100dvh" }}>
      <style>{`@import url('https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap');`}</style>

      <header className="app-header">
        {/* Top row: logo + session counter + session button */}
        <div className="header-top">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="LiftTrack" style={{ flexShrink: 0 }}>
              <rect width="28" height="28" rx="8" fill="hsl(142 71% 45%)" />
              <rect x="3" y="12" width="22" height="4" rx="2" fill="hsl(142 40% 10%)" />
              <rect x="1" y="9" width="4" height="10" rx="1.5" fill="hsl(142 40% 10%)" />
              <rect x="23" y="9" width="4" height="10" rx="1.5" fill="hsl(142 40% 10%)" />
              <rect x="5" y="7" width="3" height="14" rx="1.2" fill="hsl(142 40% 10%)" />
              <rect x="20" y="7" width="3" height="14" rx="1.2" fill="hsl(142 40% 10%)" />
            </svg>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, lineHeight: 1.1 }}>LiftTrack</div>
              {isActive && (
                <svg width="8" height="8" viewBox="0 0 8 8" style={{ flexShrink: 0 }}>
                  <circle cx="4" cy="4" r="4" fill="hsl(142 71% 45%)" />
                </svg>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => setShowExportModal(true)}
              title="Export exercises"
              data-testid="btn-export"
              style={{
                display: "flex", alignItems: "center", gap: "4px",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-muted)", padding: "4px 6px", borderRadius: "8px",
                fontSize: "var(--text-xs)", fontWeight: 600,
                transition: "color 150ms ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-text)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-text-muted)"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>

            {isActive && (
              <span
                data-testid="session-counter"
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 700,
                  color: doneCount > 0 ? "var(--color-success)" : "var(--color-text-muted)",
                  background: doneCount > 0 ? "var(--color-success-dim)" : "var(--color-surface-2, hsl(220 12% 18%))",
                  border: `1px solid ${doneCount > 0 ? "hsl(142 40% 28%)" : "var(--color-border)"}`,
                  borderRadius: "99px",
                  padding: "3px 10px 3px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  transition: "all 200ms ease",
                  whiteSpace: "nowrap",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {doneCount}
              </span>
            )}

            {!isActive ? (
              <button className="btn btn-start" onClick={handleStartSession} data-testid="btn-start-session">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z" /></svg>
                Start Workout
              </button>
            ) : (
              <button className="btn btn-end" onClick={() => setConfirmEnd(true)} data-testid="btn-end-session">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                End
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="tab-bar" data-testid="tab-bar">
          {allCategories.map((cat) => (
            <button
              key={cat}
              className={`tab-btn ${activeTab === cat ? "active-tab" : ""}`}
              onClick={() => setActiveTab(cat)}
              data-testid={`tab-${cat.toLowerCase()}`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setShowAddCategoryDialog(true)}
            data-testid="btn-add-category"
            title="Add category"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "28px", height: "28px", flexShrink: 0,
              background: "none", border: "1px solid var(--color-border)",
              borderRadius: "8px", cursor: "pointer",
              color: "var(--color-text-muted)", fontSize: "18px", lineHeight: 1,
              transition: "color 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-success)"; e.currentTarget.style.borderColor = "var(--color-success)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
          >
            +
          </button>
          <div style={{ flex: 1 }} />
          {archivedExercises.length > 0 && (
            <button
              className={`tab-btn ${activeTab === ARCHIVE_TAB ? "active-tab archive-tab-active" : "archive-tab"}`}
              onClick={() => setActiveTab(ARCHIVE_TAB)}
              data-testid="tab-archive"
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              <IconArchive />
              Archive
            </button>
          )}
        </div>
      </header>

      <main className="content">
        {filteredExercises.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--color-text-faint)" }}>
            <p style={{ fontSize: "var(--text-sm)" }}>
              {activeTab === ARCHIVE_TAB ? "No archived exercises." : `No exercises in ${activeTab} yet.`}
            </p>
          </div>
        ) : activeTab === ARCHIVE_TAB ? (
          filteredExercises.map((ex) => (
            <ExerciseCard
              key={`${ex.id}-${activeSession?.id ?? "idle"}`}
              exercise={ex}
              isActive={false}
              sessionId={activeSession?.id ?? null}
              onSetLogged={handleSetLogged}
              onSetUndone={handleSetUndone}
              onExerciseChanged={refreshExercises}
              onTabSwitch={setActiveTab}
            />
          ))
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredExercises.map((ex) => ex.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredExercises.map((ex) => (
                <SortableExerciseCard
                  key={`${ex.id}-${activeSession?.id ?? "idle"}`}
                  exercise={ex}
                  isReordering={isReordering}
                  isDropped={droppedId === ex.id}
                  isActive={isActive && !ex.archived}
                  sessionId={activeSession?.id ?? null}
                  onSetLogged={handleSetLogged}
                  onSetUndone={handleSetUndone}
                  onExerciseChanged={refreshExercises}
                  onTabSwitch={setActiveTab}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {activeTab !== ARCHIVE_TAB && (
          <button
            onClick={() => setShowAddSheet(true)}
            data-testid="btn-add-exercise"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              width: "100%",
              padding: "12px",
              background: "transparent",
              border: "1px dashed var(--color-border)",
              borderRadius: "14px",
              color: "var(--color-text-faint)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              cursor: "pointer",
              transition: "color 160ms ease, border-color 160ms ease",
              marginTop: "2px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-success)"; e.currentTarget.style.borderColor = "var(--color-success)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-faint)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
          >
            <IconPlus /> Add Exercise
          </button>
        )}

        {!isActive && activeTab !== ARCHIVE_TAB && (
          <p style={{ textAlign: "center", fontSize: "var(--text-xs)", color: "var(--color-text-faint)", marginTop: "4px" }}>
            Tap <strong style={{ color: "var(--color-success)" }}>Start</strong> to begin your session
          </p>
        )}

        <ImportButton onImport={() => { refreshExercises(); refreshCategories(); }} />
        <ResetButton onReset={refreshExercises} />
      </main>

      {showSummary && (
        <SessionSummary logs={summaryLogs} onClose={() => setShowSummary(false)} />
      )}

      {showExportModal && (
        <ExportModal exercises={exercises} onClose={() => setShowExportModal(false)} />
      )}

      {confirmEnd && (
        <Modal onClose={() => setConfirmEnd(false)}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontWeight: 700, fontSize: "var(--text-base)", marginBottom: "8px" }}>End session?</p>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: "24px" }}>
              Your logged reps will be saved and your exercises updated.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                className="btn btn-end"
                style={{ width: "100%", justifyContent: "center", padding: "12px" }}
                onClick={() => { setConfirmEnd(false); handleEndSession(); }}
                data-testid="btn-end-confirm"
              >
                End session
              </button>
              <button
                onClick={() => setConfirmEnd(false)}
                data-testid="btn-end-cancel"
                style={cancelBtnStyle}
              >
                Resume session
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showAddCategoryDialog && (
        <AddCategoryDialog
          existingCategories={categories}
          onAdd={(name) => {
            const updated = addCategory(name);
            setCategories(updated);
            setActiveTab(name);
            setShowAddCategoryDialog(false);
          }}
          onClose={() => setShowAddCategoryDialog(false)}
        />
      )}

      {showAddSheet && (
        <ExerciseSheet
          defaultCategory={activeTab !== ARCHIVE_TAB ? activeTab : undefined}
          onSave={handleAddExercise}
          onClose={() => setShowAddSheet(false)}
        />
      )}
    </div>
  );
}
