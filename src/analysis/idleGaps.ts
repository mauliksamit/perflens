// GPU idle-gap analysis.
//
// Definition (per device): the analysis window runs from the first GPU event
// start to the last GPU event end on that device. "Busy" is the union of all
// kernel/memcpy/memset intervals across every stream of the device; "idle" is
// the rest of the window. Idle here means "no GPU activity recorded by the
// profiler", not "SMs unused": a running kernel that fills one SM counts as
// busy. Gaps shorter than `minGapUs` are counted in the totals but not listed.
import type { GpuEvent } from "../model/types";

export interface Gap {
  device: number;
  start: number;
  dur: number;
  /** name of the event whose end opens the gap */
  before: string;
  /** name of the event whose start closes the gap */
  after: string;
}

export interface DeviceIdle {
  device: number;
  windowUs: number;
  busyUs: number;
  idleUs: number;
  idlePct: number;
  gapCount: number;
  /** gaps >= minGapUs, longest first */
  listed: Gap[];
}

export function idleGaps(events: readonly GpuEvent[], minGapUs = 5): DeviceIdle[] {
  const byDevice = new Map<number, GpuEvent[]>();
  for (const e of events) {
    const list = byDevice.get(e.device) ?? [];
    list.push(e);
    byDevice.set(e.device, list);
  }
  const out: DeviceIdle[] = [];
  for (const [device, evs] of [...byDevice].sort((a, b) => a[0] - b[0])) {
    const sorted = [...evs].sort((a, b) => a.start - b.start);
    const first = sorted[0]!;
    let curEnd = first.start + first.dur;
    let curEndName = first.name;
    let windowEnd = curEnd;
    let busy = 0;
    let segStart = first.start;
    let gapCount = 0;
    const listed: Gap[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const e = sorted[i]!;
      const end = e.start + e.dur;
      if (e.start > curEnd) {
        busy += curEnd - segStart;
        const dur = e.start - curEnd;
        gapCount++;
        if (dur >= minGapUs) listed.push({ device, start: curEnd, dur, before: curEndName, after: e.name });
        segStart = e.start;
        curEnd = end;
        curEndName = e.name;
      } else if (end > curEnd) {
        curEnd = end;
        curEndName = e.name;
      }
      windowEnd = Math.max(windowEnd, end);
    }
    busy += curEnd - segStart;
    const windowUs = windowEnd - first.start;
    const idleUs = Math.max(0, windowUs - busy);
    listed.sort((a, b) => b.dur - a.dur || a.start - b.start);
    out.push({
      device,
      windowUs,
      busyUs: busy,
      idleUs,
      idlePct: windowUs > 0 ? (100 * idleUs) / windowUs : 0,
      gapCount,
      listed,
    });
  }
  return out;
}
