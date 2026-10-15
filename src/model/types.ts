// Normalized data model shared by the parsers, the analyses and the UI.
// All times are microseconds (the Chrome trace unit); kern JSON milliseconds
// are kept as milliseconds in BenchRun because that is what kern reports.

export type GpuEventKind = "kernel" | "memcpy" | "memset";

export interface GpuEvent {
  name: string;
  kind: GpuEventKind;
  device: number;
  stream: number;
  /** start, microseconds, relative to the trace's first GPU event */
  start: number;
  /** duration, microseconds */
  dur: number;
  grid?: [number, number, number];
  block?: [number, number, number];
  registersPerThread?: number;
  sharedMemoryBytes?: number;
}

export interface TraceCounts {
  /** entries in traceEvents (or the top-level array) */
  totalEvents: number;
  /** ph === "X" events with numeric ts/dur */
  completeEvents: number;
  gpuEvents: number;
  cpuOps: number;
  /** events not used by perflens (metadata, flows, instant events, ...) */
  skipped: number;
}

export interface TraceModel {
  format: "chrome-trace";
  /** absolute ts (us) of the first GPU event; GpuEvent.start is relative to it */
  originUs: number;
  /** last GPU end minus first GPU start, microseconds */
  spanUs: number;
  gpuEvents: GpuEvent[];
  deviceNames: Record<number, string>;
  counts: TraceCounts;
}

export interface BenchKernelResult {
  kernel: string;
  failed: boolean;
  medianMs: number;
  minMs: number;
  p95Ms: number;
  gflops?: number;
  /** raw per-iteration timings in ms (kern: cudaEvent, kernel only) */
  iters: number[];
}

export interface BenchRun {
  format: "kern-bench";
  shape: { M: number; N: number; K: number };
  gitCommit: string;
  device: string;
  driver: string;
  compileFlags: string;
  results: BenchKernelResult[];
}

export type ParsedFile = TraceModel | BenchRun;
