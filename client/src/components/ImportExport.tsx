import { useState } from "react";
import { type Exercise, replaceExercises } from "@/lib/storage";
import { Modal, cancelBtnStyle } from "./Modal";
import type { ParsedExercise, ParseError, ParseResult, ImportStep } from "./types";

// ─── Import Parser ──────────────────────────────────────────────────────────────

export function parseImportText(text: string): ParseResult {
  const raw = text.split("\n");
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
  const isFieldLine = (s: string) => /^exercise\s*:/i.test(s) || /^max reps\s*:/i.test(s) || /^weight\s*:/i.test(s) || /^sets\s*:/i.test(s) || /^reps\s*:/i.test(s) || /^tempo\s*:/i.test(s);

  while (i < lines.length) {
    const line = lines[i];

    if (line === "" || isDivider(line)) { i++; continue; }

    if (isFieldLine(line)) {
      if (!currentCategory) return fail(i, "Found exercise fields before a category name was declared.");
    }

    if (!isFieldLine(line)) {
      currentCategory = line;
      i++;
      continue;
    }

    const blockStart = i;
    const fields: Record<string, string> = {};

    while (i < lines.length) {
      const l = lines[i];
      if (l === "" || isDivider(l)) break;
      if (!isFieldLine(l)) break;

      const colonIdx = l.indexOf(":");
      if (colonIdx === -1) return fail(i, `Expected "Key : Value" but got: "${l}"`);
      const key = l.slice(0, colonIdx).trim().toLowerCase().replace(/\s+/g, " ");
      const val = l.slice(colonIdx + 1).trim();
      fields[key] = val;
      i++;
    }

    const req = ["exercise", "max reps", "weight", "sets", "reps"];
    for (const r of req) {
      if (!fields[r]) return fail(blockStart, `Missing "${r}" field in exercise block.`);
    }

    const name = fields["exercise"];
    const maxReps = parseInt(fields["max reps"]);
    const weight = parseFloat(fields["weight"].replace(/[^\d.]/g, "") || "0");
    const parsedSets = parseInt(fields["sets"]);
    const repValues = fields["reps"].split(/,/).map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));

    if (isNaN(maxReps)) return fail(blockStart, `"max reps" value "${fields["max reps"]}" is not a number.`);
    if (isNaN(weight)) return fail(blockStart, `"weight" value "${fields["weight"]}" is not a number.`);
    if (isNaN(parsedSets))   return fail(blockStart, `"sets" value "${fields["sets"]}" is not a number.`);
    if (repValues.length === 0) return fail(blockStart, `"reps" value "${fields["reps"]}" could not be parsed as a number.`);

    const lastReps = repValues[0];
    const lastRepsSets = repValues.length > 1 ? repValues : undefined;
    const sets = lastRepsSets ? lastRepsSets.length : parsedSets;

    const tempo = fields["tempo"] ? fields["tempo"].trim() : undefined;

    exercises.push({
      name,
      category: currentCategory!,
      weight,
      maxReps,
      sets,
      lastReps,
      ...(lastRepsSets ? { lastRepsSets } : {}),
      ...(tempo ? { tempo } : {}),
      sortOrder: sortOrder++,
      archived: false,
    });
  }

  if (exercises.length === 0) {
    return { ok: false, error: { lineIndex: 0, message: "No exercises found in file.", lines: raw } };
  }

  return { ok: true, exercises };
}

// ─── Export Text Builder ────────────────────────────────────────────────────────

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
      const repsStr = e.lastRepsSets && e.lastRepsSets.length > 1
        ? e.lastRepsSets.join(", ")
        : String(e.lastReps ?? "\u2013");
      lines.push(`Reps : ${repsStr}`);
      if (e.tempo) lines.push(`Tempo : ${e.tempo}`);
      if (i < exs.length - 1) lines.push("\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014");
    });
    lines.push("");
  }
  return lines.join("\n");
}

// ─── Encode / Decode state string ───────────────────────────────────────────────

export async function encodeState(exercises: Exercise[]): Promise<string> {
  // Strip isFavourite — favourite status is not exported
  const sanitized = exercises.map(({ isFavourite: _fav, ...rest }) => rest);
  const json = JSON.stringify(sanitized);
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

// ─── Import Button ──────────────────────────────────────────────────────────────

export function ImportButton({ onImport }: { onImport: () => void }) {
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

  const groupSummary = parsed
    ? Object.entries(
        parsed.reduce<Record<string, number>>((acc, ex) => {
          acc[ex.category] = (acc[ex.category] ?? 0) + 1;
          return acc;
        }, {})
      )
    : [];

  const ErrorDisplay = () => {
    if (!parseError) return null;
    const { lineIndex, lines } = parseError;
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
    <button
      onClick={() => setStep("warn")}
      className="bar-btn"
      data-testid="btn-import"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 5 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Import
    </button>
  );
}

// ─── Export Modal ────────────────────────────────────────────────────────────────

export function ExportModal({ exercises, onClose }: { exercises: Exercise[]; onClose: () => void }) {
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
