/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [path.resolve(import.meta.dirname, "client/src/test/setup.ts")],
    include: [path.resolve(import.meta.dirname, "client/src/**/*.{test,spec}.{ts,tsx}")],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
