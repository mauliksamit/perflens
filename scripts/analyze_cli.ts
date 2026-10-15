// Command-line front end to perflens's analysis pipeline (the same
// analyzeBytes() the Web Worker runs). Prints one JSON object per input file:
// event counts, GPU span, idle time and gaps per device, heuristic category
// totals, and the top kernels. Lets other repos cite perflens output.
//
// Usage: npx vite-node scripts/analyze_cli.ts <trace.json[.gz]> [...]
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { analyzeBytes } from "../src/analysis/analyze";
import { displayName } from "../src/analysis/demangle";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: analyze_cli.ts <trace.json[.gz]> [...]");
  process.exit(2);
}
const out = [];
for (const f of files) {
  const a = await analyzeBytes(f, new Uint8Array(readFileSync(f)));
  if (a.file.format !== "chrome-trace" || !a.analysis) {
    out.push({ file: basename(f), error: "not a Chrome trace" });
    continue;
  }
  const kernels = a.file.gpuEvents.filter((e) => e.kind === "kernel").length;
  out.push({
    file: basename(f),
    counts: a.file.counts,
    gpu_kernels: kernels,
    gpu_span_us: a.file.spanUs,
    idle: a.analysis.idle.map((d) => ({
      device: d.device, window_us: d.windowUs, busy_us: d.busyUs, idle_us: d.idleUs, idle_pct: d.idlePct,
      gap_count: d.gapCount, listed_gaps_ge_5us: d.listed.length,
    })),
    buckets_heuristic: a.analysis.buckets.map((b) => ({ bucket: b.bucket, total_us: b.totalUs, count: b.count, share_pct: b.sharePct })),
    top_kernels: a.analysis.top.slice(0, 8).map((k) => ({
      name: displayName(k.name), kind: k.kind, count: k.count, total_us: k.totalUs, share_pct: k.sharePct,
    })),
  });
}
console.log(JSON.stringify(out, null, 2));
