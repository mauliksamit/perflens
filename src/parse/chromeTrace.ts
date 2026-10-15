// Parser for PyTorch profiler (Kineto) Chrome trace JSON.
//
// Accepted shapes: { traceEvents: [...] , deviceProperties?: [...] } or a bare
// array of events (the Chrome "JSON array format"). Only complete events
// (ph === "X") are used. GPU activity is recognised by category, matching
// Kineto's names case-insensitively ("kernel", "gpu_memcpy", "gpu_memset";
// older releases wrote "Kernel", "Memcpy", "Memset"). Everything else is
// counted as skipped, never guessed at.
import type { GpuEvent, GpuEventKind, TraceModel } from "../model/types";
import { ParseError, isRecord, toDim3, toNumber, toStr } from "./guards";

const GPU_CATEGORIES: Record<string, GpuEventKind> = {
  kernel: "kernel",
  gpu_memcpy: "memcpy",
  memcpy: "memcpy",
  gpu_memset: "memset",
  memset: "memset",
};

export function looksLikeChromeTrace(json: unknown): boolean {
  if (Array.isArray(json)) return json.length === 0 || isRecord(json[0]);
  return isRecord(json) && Array.isArray(json.traceEvents);
}

export function parseChromeTrace(json: unknown): TraceModel {
  let events: unknown[];
  let deviceProps: unknown = undefined;
  if (Array.isArray(json)) {
    events = json;
  } else if (isRecord(json) && Array.isArray(json.traceEvents)) {
    events = json.traceEvents;
    deviceProps = json.deviceProperties;
  } else {
    throw new ParseError("not a Chrome trace: expected an object with a traceEvents array, or an array of events");
  }

  const raw: GpuEvent[] = [];
  let complete = 0;
  let cpuOps = 0;
  let skipped = 0;
  for (const e of events) {
    if (!isRecord(e) || e.ph !== "X") {
      skipped++;
      continue;
    }
    const ts = toNumber(e.ts);
    const dur = toNumber(e.dur);
    if (ts === undefined || dur === undefined || dur < 0) {
      skipped++;
      continue;
    }
    complete++;
    const cat = (toStr(e.cat) ?? "").toLowerCase();
    const kind = GPU_CATEGORIES[cat];
    if (kind === undefined) {
      if (cat === "cpu_op") cpuOps++;
      continue;
    }
    const args = isRecord(e.args) ? e.args : {};
    const ev: GpuEvent = {
      name: toStr(e.name) ?? "(unnamed)",
      kind,
      device: toNumber(args.device) ?? toNumber(e.pid) ?? 0,
      stream: toNumber(args.stream) ?? toNumber(e.tid) ?? 0,
      start: ts,
      dur,
    };
    const grid = toDim3(args.grid);
    const block = toDim3(args.block);
    const regs = toNumber(args["registers per thread"]);
    const smem = toNumber(args["shared memory"]);
    if (grid) ev.grid = grid;
    if (block) ev.block = block;
    if (regs !== undefined) ev.registersPerThread = regs;
    if (smem !== undefined) ev.sharedMemoryBytes = smem;
    raw.push(ev);
  }

  raw.sort((a, b) => a.start - b.start);
  const originUs = raw.length > 0 ? raw[0]!.start : 0;
  let endUs = originUs;
  for (const ev of raw) {
    ev.start -= originUs;
    endUs = Math.max(endUs, originUs + ev.start + ev.dur);
  }

  const deviceNames: Record<number, string> = {};
  if (Array.isArray(deviceProps)) {
    for (const d of deviceProps) {
      if (!isRecord(d)) continue;
      const id = toNumber(d.id);
      const name = toStr(d.name);
      if (id !== undefined && name !== undefined) deviceNames[id] = name;
    }
  }

  return {
    format: "chrome-trace",
    originUs,
    spanUs: endUs - originUs,
    gpuEvents: raw,
    deviceNames,
    counts: { totalEvents: events.length, completeEvents: complete, gpuEvents: raw.length, cpuOps, skipped },
  };
}
