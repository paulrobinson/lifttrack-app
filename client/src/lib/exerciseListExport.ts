// Plain-text exercise list (the format the Export button downloads and the
// Import parser reads back).

import type { Exercise } from "./storage";

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
      if (e.minReps != null) lines.push(`Min reps : ${e.minReps}`);
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
