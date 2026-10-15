// Run comparison with an explicit noise band.
//
// For each item present in both runs (a kern kernel, or a trace kernel name)
// we compare medians of the raw samples (kern: per-iteration cudaEvent times;
// trace: per-invocation durations):
//   ratio = median(B) / median(A); change = ratio - 1   (positive = B slower)
// Noise: a 95% percentile-bootstrap confidence interval for the ratio
// (resample A and B independently with replacement, `resamples` times, with a
// fixed-seed PRNG so the verdict is reproducible).
// Verdict:
//   "slower"  if the whole CI is above 1 AND |change| >= threshold
//   "faster"  if the whole CI is below 1 AND |change| >= threshold
//   "inconclusive" otherwise (CI includes no-change, change below the
//   practical threshold, or fewer than `minSamples` samples on either side).
// The default threshold (5%) matches kern's repeat-run drift rule.
import { median, mulberry32, percentile } from "./stats";

export type Verdict = "faster" | "slower" | "inconclusive";

export interface CompareOptions {
  thresholdPct: number;
  resamples: number;
  minSamples: number;
  seed: number;
}

export const DEFAULT_COMPARE: CompareOptions = { thresholdPct: 5, resamples: 2000, minSamples: 5, seed: 12345 };

export interface Comparison {
  key: string;
  nA: number;
  nB: number;
  medianA: number;
  medianB: number;
  changePct: number;
  ciLowPct: number;
  ciHighPct: number;
  verdict: Verdict;
  reason: string;
}

export function compareSamples(
  key: string,
  a: readonly number[],
  b: readonly number[],
  opts: CompareOptions = DEFAULT_COMPARE,
): Comparison {
  const mA = median(a);
  const mB = median(b);
  const changePct = 100 * (mB / mA - 1);
  const base = { key, nA: a.length, nB: b.length, medianA: mA, medianB: mB, changePct };
  if (a.length < opts.minSamples || b.length < opts.minSamples) {
    return { ...base, ciLowPct: Number.NaN, ciHighPct: Number.NaN, verdict: "inconclusive",
      reason: `fewer than ${opts.minSamples} samples` };
  }
  const rnd = mulberry32(opts.seed);
  const ratios: number[] = new Array(opts.resamples);
  const ra: number[] = new Array(a.length);
  const rb: number[] = new Array(b.length);
  for (let r = 0; r < opts.resamples; r++) {
    for (let i = 0; i < a.length; i++) ra[i] = a[Math.floor(rnd() * a.length)]!;
    for (let i = 0; i < b.length; i++) rb[i] = b[Math.floor(rnd() * b.length)]!;
    ratios[r] = median(rb) / median(ra);
  }
  const lo = 100 * (percentile(ratios, 2.5) - 1);
  const hi = 100 * (percentile(ratios, 97.5) - 1);
  let verdict: Verdict = "inconclusive";
  let reason: string;
  if (lo <= 0 && hi >= 0) reason = "95% CI includes no change";
  else if (Math.abs(changePct) < opts.thresholdPct) reason = `change below ${opts.thresholdPct}% threshold`;
  else {
    verdict = lo > 0 ? "slower" : "faster";
    reason = `95% CI excludes no change and |change| >= ${opts.thresholdPct}%`;
  }
  return { ...base, ciLowPct: lo, ciHighPct: hi, verdict, reason };
}

/** Compare every key present in both maps; keys only in one side are reported separately. */
export function compareGroups(
  a: ReadonlyMap<string, readonly number[]>,
  b: ReadonlyMap<string, readonly number[]>,
  opts: CompareOptions = DEFAULT_COMPARE,
): { rows: Comparison[]; onlyA: string[]; onlyB: string[] } {
  const rows: Comparison[] = [];
  for (const [k, sa] of a) {
    const sb = b.get(k);
    if (sb) rows.push(compareSamples(k, sa, sb, opts));
  }
  return {
    rows,
    onlyA: [...a.keys()].filter((k) => !b.has(k)),
    onlyB: [...b.keys()].filter((k) => !a.has(k)),
  };
}
