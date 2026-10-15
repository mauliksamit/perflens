// Generate README screenshots from the real app and real samples, and record
// in-browser parse timings (measured inside the Web Worker by the app itself).
// Usage: npm run build && npm run screenshots
// Writes docs/screenshots/*.png and results/browser_parse.json.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const URL = "http://localhost:4173/";
const LARGE = "Large: eager block, 300 steps (.gz)";
const REPEATS = 5;

function startPreview() {
  // Run vite's own entry with node (no shell) so kill() reaches the server
  // itself; a shell wrapper would leave vite orphaned on Windows.
  const vite = join(ROOT, "node_modules", "vite", "bin", "vite.js");
  const p = spawn(process.execPath, [vite, "preview", "--port", "4173", "--strictPort"], { cwd: ROOT, stdio: "pipe" });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("vite preview did not start")), 30_000);
    p.stdout.on("data", (d) => {
      if (String(d).includes("4173")) {
        clearTimeout(t);
        resolve(p);
      }
    });
    p.on("exit", (c) => reject(new Error(`vite preview exited ${c}`)));
  });
}

async function load(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByTestId("busy").waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});
  await page.getByTestId("parse-stats").waitFor();
}

const server = await startPreview();
const browser = await chromium.launch();
try {
  const shots = join(ROOT, "docs", "screenshots");
  mkdirSync(shots, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });

  await page.goto(URL);
  await load(page, "Transformer block (eager attention)");
  await page.screenshot({ path: join(shots, "trace.png"), fullPage: true });
  await page.getByTestId("timeline-canvas").screenshot({ path: join(shots, "timeline.png") });

  await page.goto(URL);
  await load(page, "kern 1024³ run N (fast-math)");
  await load(page, "kern 1024³ run V (strict)");
  await page.getByTestId("compare").screenshot({ path: join(shots, "compare.png") });

  const runs = [];
  for (let i = 0; i < REPEATS; i++) {
    await page.goto(URL);
    await load(page, LARGE);
    const el = page.getByTestId("parse-stats");
    runs.push({
      trace_events: Number(await el.getAttribute("data-events")),
      worker_total_ms: Number(await el.getAttribute("data-parse-ms")),
    });
  }
  const sorted = runs.map((r) => r.worker_total_ms).sort((a, b) => a - b);
  const result = {
    generated_by: "scripts/screenshots.mjs",
    sample: "data/traces/block_eager_300steps.json.gz",
    browser: `chromium ${browser.version()} (Playwright, headless)`,
    repeats: REPEATS,
    trace_events: runs[0]?.trace_events ?? null,
    worker_total_ms_median: sorted[Math.floor(sorted.length / 2)],
    worker_total_ms_runs: runs.map((r) => r.worker_total_ms),
    definition:
      "Time inside the Web Worker for gunzip + JSON.parse + normalize + analyses, from performance.now() in the worker (app's data-parse-ms); excludes fetch and React render. Each repeat is a fresh page load.",
  };
  mkdirSync(join(ROOT, "results"), { recursive: true });
  writeFileSync(join(ROOT, "results", "browser_parse.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(result);
} finally {
  await browser.close();
  server.kill();
}
