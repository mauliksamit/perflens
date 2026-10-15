// Top-kernel table: GPU events grouped by name, ranked by total time.
import type { GpuEvent } from "../model/types";
import { median } from "./stats";

export interface KernelStat {
  name: string;
  kind: GpuEvent["kind"];
  count: number;
  totalUs: number;
  medianUs: number;
  minUs: number;
  maxUs: number;
  /** share of summed GPU event time (not of wall time; streams can overlap) */
  sharePct: number;
}

export function topKernels(events: readonly GpuEvent[]): KernelStat[] {
  const groups = new Map<string, { kind: GpuEvent["kind"]; durs: number[] }>();
  let all = 0;
  for (const e of events) {
    const key = `${e.kind}\u0000${e.name}`;
    let g = groups.get(key);
    if (!g) {
      g = { kind: e.kind, durs: [] };
      groups.set(key, g);
    }
    g.durs.push(e.dur);
    all += e.dur;
  }
  const out: KernelStat[] = [];
  for (const [key, g] of groups) {
    const total = g.durs.reduce((a, b) => a + b, 0);
    out.push({
      name: key.slice(key.indexOf("\u0000") + 1),
      kind: g.kind,
      count: g.durs.length,
      totalUs: total,
      medianUs: median(g.durs),
      minUs: Math.min(...g.durs),
      maxUs: Math.max(...g.durs),
      sharePct: all > 0 ? (100 * total) / all : 0,
    });
  }
  out.sort((a, b) => b.totalUs - a.totalUs || a.name.localeCompare(b.name));
  return out;
}
