import type { Exercise } from "@/lib/storage";

export interface SetLog {
  exerciseId: number;
  exerciseName: string;
  repsAchieved: number;
  isDecline: boolean;
  isUp: boolean;
  weight: number;
  sets: number;
}

export type ParsedExercise = Omit<Exercise, "id">;

export interface ParseError {
  lineIndex: number;
  message: string;
  lines: string[];
}

export type ParseResult =
  | { ok: true; exercises: ParsedExercise[] }
  | { ok: false; error: ParseError };

export type ImportStep = "idle" | "warn" | "choose" | "paste" | "error" | "confirm";
