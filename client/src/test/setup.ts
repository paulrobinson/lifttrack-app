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
