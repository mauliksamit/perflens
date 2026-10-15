// Claims audit: every measurement-like number in README.md and docs/*.md must
// trace to a generated file (results/*.json or a data/**/*.meta.json), or be
// on the same line as "NOT RUN", or be a documented constant in
// scripts/audit_constants.json (a setting such as the 5% threshold, not a
// measurement).
//
// A number counts as traced when it equals a traced value within its own
// printed precision (or 1%), after unit conversion (bytes -> KiB/MiB/kB/MB),
// or, for % and x/×, when it equals 100*a/b, 100*(a/b-1) or a/b for two traced
// values. Fenced code blocks are skipped (commands, not claims).
// Exit 0 = pass, 1 = untraced number found.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function walk(dir, pred, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

function leaves(v, out) {
  if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => leaves(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => leaves(x, out));
  return out;
}

const sources = [
  ...walk(join(ROOT, "results"), (p) => p.endsWith(".json") && !p.includes("_raw")),
  ...walk(join(ROOT, "data"), (p) => p.endsWith(".meta.json")),
];
const traced = [];
for (const s of sources) leaves(JSON.parse(readFileSync(s, "utf-8")), traced);
const uniq = [...new Set(traced)];

const constants = JSON.parse(readFileSync(join(ROOT, "scripts", "audit_constants.json"), "utf-8")).constants;

const UNIT = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(ms|µs|us|KiB|MiB|kB|KB|MB|%|×|x(?![a-z0-9])|tests?\b|events?\b)/g;

function decimals(s) {
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

function close(v, t, dec) {
  return Math.abs(v - t) <= Math.max(0.5 * 10 ** -dec + 1e-9, 0.01 * Math.abs(t));
}

function isTraced(v, unit, dec) {
  const conv = { KiB: 1024, MiB: 1024 * 1024, kB: 1000, KB: 1000, MB: 1e6 }[unit] ?? 1;
  if (uniq.some((t) => close(v, t / conv, dec) || close(v, t, dec))) return true;
  if (unit === "%" || unit === "×" || unit === "x") {
    for (const a of uniq) {
      for (const b of uniq) {
        if (!b) continue;
        const r = a / b;
        if (unit === "%" && (close(v, 100 * r, dec) || close(Math.abs(v), Math.abs(100 * (r - 1)), dec))) return true;
        if (unit !== "%" && close(v, r, dec)) return true;
      }
    }
  }
  return false;
}

const docs = [join(ROOT, "README.md"), ...walk(join(ROOT, "docs"), (p) => p.endsWith(".md"))];
const failures = [];
let checked = 0;
for (const file of docs) {
  if (!existsSync(file)) continue;
  let inFence = false;
  readFileSync(file, "utf-8").split(/\r?\n/).forEach((line, i) => {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (inFence || /NOT RUN/.test(line)) return;
    for (const m of line.matchAll(UNIT)) {
      const raw = m[1];
      const unit = m[2];
      const v = Number(raw.replace(/,/g, ""));
      const ctx = line.slice(Math.max(0, m.index - 50), m.index + m[0].length + 20);
      if (constants.some((c) => c.value === v && new RegExp(c.context, "i").test(line))) continue;
      checked++;
      if (!isTraced(v, unit, decimals(raw.replace(/,/g, "")))) {
        failures.push(`${file.slice(ROOT.length + 1)}:${i + 1}: ${m[0]}  …${ctx.trim()}…`);
      }
    }
  });
}

if (failures.length) {
  console.log(`CLAIMS AUDIT FAILED: ${failures.length} untraced number(s):`);
  for (const f of failures) console.log("  " + f);
  console.log("Fix: regenerate results (npm run facts), mark NOT RUN, or document a constant in scripts/audit_constants.json.");
  process.exit(1);
}
console.log(`CLAIMS AUDIT PASSED (${checked} numbers checked against ${uniq.length} traced values from ${sources.length} files).`);
