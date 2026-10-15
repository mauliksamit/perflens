// Generate results/facts.json: every number perflens's README/docs may cite.
// Nothing here is typed by hand; each value is measured or counted by this
// script (or copied from results/browser_parse.json, written by
// scripts/screenshots.mjs from the running app).
//
// Usage: npm run build && npm run screenshots && npm run facts
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { analyzeBytes } from "../src/analysis/analyze";
import { median } from "../src/analysis/stats";
import { isRecord, toNumber } from "../src/parse/guards";

const ROOT = process.cwd();
const RAW = join(ROOT, "results", "_raw");
mkdirSync(RAW, { recursive: true });

function sh(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function listSamples(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if ((f.endsWith(".json") || f.endsWith(".json.gz")) && !f.endsWith(".meta.json") && f !== "samples.json") out.push(p);
    }
  };
  walk(join(ROOT, "data"));
  return out;
}

async function parseTiming() {
  // Largest sample by decompressed size, parsed REPEATS times in Node.
  const REPEATS = 7;
  let best: { path: string; textBytes: number } | null = null;
  for (const p of listSamples()) {
    const raw = readFileSync(p);
    const size = p.endsWith(".gz") ? gunzipSync(raw).length : raw.length;
    if (!best || size > best.textBytes) best = { path: p, textBytes: size };
  }
  if (!best) throw new Error("no samples in data/");
  const bytes = new Uint8Array(readFileSync(best.path));
  const totals: number[] = [];
  const parses: number[] = [];
  let events = 0;
  let gpuEvents = 0;
  for (let i = 0; i < REPEATS; i++) {
    const a = await analyzeBytes(best.path, bytes.slice());
    totals.push(a.timings.decodeMs + a.timings.parseMs + a.timings.analyzeMs);
    parses.push(a.timings.parseMs);
    if (a.file.format === "chrome-trace") {
      events = a.file.counts.totalEvents;
      gpuEvents = a.file.counts.gpuEvents;
    }
  }
  return {
    sample: best.path.slice(ROOT.length + 1).replace(/\\/g, "/"),
    file_bytes: bytes.length,
    json_bytes: best.textBytes,
    trace_events: events,
    gpu_events: gpuEvents,
    repeats: REPEATS,
    node_total_ms_median: Number(median(totals).toFixed(1)),
    node_parse_ms_median: Number(median(parses).toFixed(1)),
    definition:
      "Node (vite-node) on this machine: gunzip + JSON.parse + normalize + analyses (top kernels, idle gaps, heuristic buckets); median of repeats. Not a browser measurement.",
  };
}

function unitTests() {
  const out = join(RAW, "vitest.json");
  sh(`npx vitest run --reporter=json --outputFile="${out}"`);
  const j: unknown = JSON.parse(readFileSync(out, "utf-8"));
  if (!isRecord(j)) throw new Error("bad vitest json");
  return {
    total: toNumber(j.numTotalTests) ?? -1,
    passed: toNumber(j.numPassedTests) ?? -1,
    failed: toNumber(j.numFailedTests) ?? -1,
    files: toNumber(j.numTotalTestSuites) ?? -1,
    command: "npx vitest run",
  };
}

function e2eTests() {
  const txt = sh("npx playwright test --list");
  const m = /Total: (\d+) tests? in (\d+) files?/.exec(txt);
  return {
    total: m ? Number(m[1]) : -1,
    files: m ? Number(m[2]) : -1,
    command: "npx playwright test --list (count only; pass/fail is recorded by CI and LOG.md)",
  };
}

function bundle() {
  const dir = join(ROOT, "dist", "assets");
  if (!existsSync(dir)) return { status: "NOT RUN: dist/ missing, run npm run build first" };
  const files = readdirSync(dir).map((f) => {
    const buf = readFileSync(join(dir, f));
    return { file: f.replace(/-[A-Za-z0-9_-]{8}\./, "."), bytes: buf.length, gzip_bytes: gzipSync(buf).length };
  });
  const js = files.filter((f) => f.file.endsWith(".js"));
  return {
    files,
    js_bytes: js.reduce((s, f) => s + f.bytes, 0),
    js_gzip_bytes: js.reduce((s, f) => s + f.gzip_bytes, 0),
    definition: "dist/assets after `npm run build`; gzip = Node zlib default level",
  };
}

function browserParse() {
  const p = join(ROOT, "results", "browser_parse.json");
  if (!existsSync(p)) return { status: "NOT RUN: run `npm run build && npm run screenshots`" };
  return { source: "results/browser_parse.json (written by scripts/screenshots.mjs)", ...JSON.parse(readFileSync(p, "utf-8")) };
}

const facts = {
  generated_by: "scripts/facts.ts",
  date_utc: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  git_commit: sh("git rev-parse --verify -q HEAD").trim() || "uncommitted",
  environment: { node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model ?? "unknown" },
  samples: listSamples().map((p) => p.slice(ROOT.length + 1).replace(/\\/g, "/")),
  largest_sample_parse: await parseTiming(),
  browser_parse: browserParse(),
  unit_tests: unitTests(),
  e2e_tests: e2eTests(),
  bundle: bundle(),
  lighthouse: {
    status: "NOT RUN",
    reason: "no Lighthouse run in this environment",
    command: "npx lighthouse http://localhost:4173 --output=json --output-path=results/lighthouse.json (after npm run build && npm run preview)",
  },
};

mkdirSync(join(ROOT, "results"), { recursive: true });
writeFileSync(join(ROOT, "results", "facts.json"), JSON.stringify(facts, null, 2) + "\n");
console.log(JSON.stringify(facts, null, 2));
