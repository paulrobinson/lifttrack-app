import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

// Clear localStorage before every test so each test starts with a clean slate.
beforeEach(() => {
  localStorage.clear();
});
