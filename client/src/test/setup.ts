import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";

// Clear localStorage before every test so each test starts with a clean slate.
beforeEach(() => {
  localStorage.clear();
});

// recharts (and dnd-kit) use ResizeObserver internally; jsdom doesn't include it.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// jsdom has no object URLs; the JSON export falls back to a blob download.
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:mock";
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
