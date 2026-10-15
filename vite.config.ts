/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// PERFLENS_BASE lets the GitHub Pages workflow serve the app from
// /<repo>/ while local dev and e2e use "/".
export default defineConfig({
  base: process.env.PERFLENS_BASE ?? "/",
  plugins: [react()],
  // data/ holds the real sample files (with .meta.json provenance beside each);
  // serving it as the public dir keeps one copy of every sample.
  publicDir: "data",
  worker: { format: "es" },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
