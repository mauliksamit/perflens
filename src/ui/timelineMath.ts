// Pure helpers for the timeline (unit-tested; no DOM).

export interface View {
  t0: number;
  t1: number;
}

/** Zoom by `factor` (>1 zooms in) keeping time `anchor` fixed on screen. */
export function zoomView(v: View, factor: number, anchor: number, minSpan = 0.5, maxSpan = Infinity): View {
  const span = Math.min(maxSpan, Math.max(minSpan, (v.t1 - v.t0) / factor));
  const frac = (anchor - v.t0) / (v.t1 - v.t0);
  const t0 = anchor - frac * span;
  return { t0, t1: t0 + span };
}

export function panView(v: View, deltaUs: number): View {
  return { t0: v.t0 + deltaUs, t1: v.t1 + deltaUs };
}

/** "Nice" tick step (1, 2, 5 x 10^k) giving roughly `target` ticks over span. */
export function tickStep(span: number, target = 8): number {
  if (!(span > 0)) return 1;
  const raw = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return nice * pow;
}

/** Index of the first item whose start >= t (items sorted by start). */
export function lowerBound(starts: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
