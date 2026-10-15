// One entry point used by the Web Worker and by Node scripts (facts.ts):
// bytes -> text -> parsed model -> analyses, with stage timings.
import type { BenchRun, ParsedFile, TraceModel } from "../model/types";
import { bytesToText, parseText } from "../parse/detect";
import { bucketTotals, type BucketTotal } from "./classify";
import { idleGaps, type DeviceIdle } from "./idleGaps";
import { topKernels, type KernelStat } from "./topKernels";

export interface TraceAnalysis {
  top: KernelStat[];
  idle: DeviceIdle[];
  /** HEURISTIC (name-based) — see classify.ts */
  buckets: BucketTotal[];
}

export interface StageTimings {
  decodeMs: number;
  parseMs: number;
  analyzeMs: number;
}

export type Analyzed =
  | { name: string; file: TraceModel; analysis: TraceAnalysis; timings: StageTimings; bytes: number }
  | { name: string; file: BenchRun; analysis: null; timings: StageTimings; bytes: number };

export function analyzeTrace(t: TraceModel): TraceAnalysis {
  return { top: topKernels(t.gpuEvents), idle: idleGaps(t.gpuEvents), buckets: bucketTotals(t.gpuEvents) };
}

export async function analyzeBytes(
  name: string,
  bytes: Uint8Array,
  now: () => number = () => performance.now(),
): Promise<Analyzed> {
  const t0 = now();
  const text = await bytesToText(bytes);
  const t1 = now();
  const file: ParsedFile = parseText(text);
  const t2 = now();
  if (file.format === "chrome-trace") {
    const analysis = analyzeTrace(file);
    const t3 = now();
    return { name, file, analysis, bytes: bytes.length,
      timings: { decodeMs: t1 - t0, parseMs: t2 - t1, analyzeMs: t3 - t2 } };
  }
  return { name, file, analysis: null, bytes: bytes.length,
    timings: { decodeMs: t1 - t0, parseMs: t2 - t1, analyzeMs: 0 } };
}

/** Sample groups used by run comparison: kern iters per kernel, or trace durations per kernel name. */
export function sampleGroups(a: Analyzed): Map<string, number[]> {
  const m = new Map<string, number[]>();
  if (a.file.format === "kern-bench") {
    for (const r of a.file.results) if (!r.failed && r.iters.length > 0) m.set(r.kernel, r.iters);
  } else {
    for (const e of a.file.gpuEvents) {
      if (e.kind !== "kernel") continue;
      const list = m.get(e.name) ?? [];
      list.push(e.dur);
      m.set(e.name, list);
    }
  }
  return m;
}
