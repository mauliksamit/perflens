# Architecture

## Data flow

```
File / dropped file / bundled sample (fetch)
        │  ArrayBuffer, transferred (not copied)
        ▼
Web Worker  src/worker/parse.worker.ts
  bytesToText      gzip magic 1f 8b → DecompressionStream("gzip")      src/parse/detect.ts
  parseText        JSON.parse → detect format → parser                  src/parse/*
  analyzeTrace     topKernels · idleGaps · bucketTotals (heuristic)    src/analysis/*
  stage timings    performance.now() around decode / parse / analyze
        │  structured clone of the result
        ▼
React UI  src/ui/*   Timeline (canvas) · TraceView tables · BenchView · ComparePanel
```

The worker client (`src/worker/client.ts`) has no main-thread fallback on
purpose: if a result is on screen, it was parsed in the worker. The same
`analyzeBytes` pipeline runs in Node for unit tests and `scripts/facts.ts`.

## Normalized model (`src/model/types.ts`)

- `TraceModel`: GPU events (`name`, `kind` = kernel | memcpy | memset,
  `device`, `stream`, `start` and `dur` in µs, optional grid/block/registers/
  shared memory), device names, and counts. Every input event is counted
  exactly once as GPU, CPU op, other complete event, or skipped.
  Times are rebased to the first GPU event.
- `BenchRun`: kern's shape, commit, device, flags, and per-kernel
  median/min/p95 plus the raw per-iteration timings.

Inputs are `unknown` and narrowed with guards (`src/parse/guards.ts`); there
is no `any` in parsers or analysis code (ESLint enforces it).

## Analyses and their definitions

**Top kernels.** GPU events grouped by (kind, name); total, count, median,
min, max. Share = this kernel's time / summed GPU event time. With
concurrent streams that sum can exceed wall time, so share is not a
fraction of wall time.

**Idle gaps.** Per device, the window runs from the first GPU event start to
the last GPU event end. Busy = union of all kernel/memcpy/memset intervals
across every stream; idle = window − busy. Each gap records the event that
ends last before it and the event that starts it. Gaps below 5 µs count in
the totals but are not listed (a setting, `minGapUs`). Idle means "the
profiler recorded no GPU activity"; it says nothing about SM utilization
inside a kernel.

**Run comparison.** For items present in both runs (kern kernels, or trace
kernel names), samples are kern's raw per-iteration timings or a trace's
per-invocation durations. change = median(B)/median(A) − 1. The 95%
percentile-bootstrap CI of that ratio uses 2,000 resamples of A and B with a
seeded PRNG (mulberry32), so a verdict is reproducible. The verdict is
"faster"/"slower" only if the CI excludes no-change **and** |change| is at
least the threshold (default 5%, matching kern's repeat-run drift rule);
otherwise "inconclusive", with the reason shown on hover. Fewer than 5
samples on either side is always inconclusive. The threshold encodes
"too small to act on", the CI encodes "could be noise"; a 1.3% change with
a tight CI is inconclusive by design.

**Kernel categories (heuristic).** Ordered substring rules on kernel names
(attention before GEMM, since attention kernels often contain "gemm").
Library and version specific, can misfile; labeled "heuristic" wherever it
appears, including the timeline colors.

**Display names.** Kernel names on Windows/CUDA builds of PyTorch are
Itanium-mangled. `src/analysis/demangle.ts` decodes only the leading
`<length><identifier>` components and the first plain template argument
(e.g. `at::native::elementwise_kernel<…>`). It is not a demangler; the
full mangled name is always kept and shown on hover, and comparison keys
use full names.

## Timeline rendering

A single `<canvas>` sized to the container (device-pixel-ratio aware). Each
lane keeps its events sorted by start plus the lane's longest duration, so
the first possibly-visible event is found with a binary search on
`start ≥ t0 − maxDur`. While drawing, events narrower than a pixel that
land in an already-drawn pixel column are skipped, which bounds draw calls
per lane by the canvas width rather than the event count. Zoom keeps the
time under the cursor fixed (`zoomView`); pan shifts the window; both are
pure functions with unit tests (`src/ui/timelineMath.ts`).

## Testing and evidence

- Vitest unit tests (Node): parsers (synthetic edge cases plus an
  independent category count on a real trace), analyses (overlapping and
  nested streams, gap attribution, CI vs threshold verdicts, determinism),
  timeline math, display names.
- Playwright e2e against the production build (`vite preview`): worker is
  created, timeline/tables render, zoom works, kern compare shows verdicts,
  large gzipped sample loads, invalid input shows an error.
- `scripts/facts.ts`, `scripts/screenshots.mjs` and
  `scripts/render_facts.mjs` generate every number in the README;
  `scripts/claims_audit.mjs` fails on untraced numbers.
