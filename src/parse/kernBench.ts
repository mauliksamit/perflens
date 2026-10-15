// Parser for kern benchmark JSON (github.com/mauliksamit/kern, src/bench.cu):
// one shape per file, one entry per kernel with median/min/p95 in ms and the
// raw per-iteration cudaEvent timings in `iters`.
import type { BenchKernelResult, BenchRun } from "../model/types";
import { ParseError, isRecord, toNumber, toStr } from "./guards";

export function looksLikeKernBench(json: unknown): boolean {
  return isRecord(json) && Array.isArray(json.results) && toNumber(json.M) !== undefined;
}

export function parseKernBench(json: unknown): BenchRun {
  if (!isRecord(json) || !Array.isArray(json.results)) {
    throw new ParseError("not a kern bench file: expected an object with a results array");
  }
  const M = toNumber(json.M);
  const N = toNumber(json.N);
  const K = toNumber(json.K);
  if (M === undefined || N === undefined || K === undefined) {
    throw new ParseError("kern bench file is missing numeric M/N/K");
  }
  const results: BenchKernelResult[] = [];
  for (const r of json.results) {
    if (!isRecord(r)) continue;
    const kernel = toStr(r.kernel);
    if (kernel === undefined) continue;
    const failed = r.failed === true || r.skipped === true;
    const iters = Array.isArray(r.iters)
      ? r.iters.map(toNumber).filter((x): x is number => x !== undefined)
      : [];
    const res: BenchKernelResult = {
      kernel,
      failed,
      medianMs: toNumber(r.median_ms) ?? Number.NaN,
      minMs: toNumber(r.min_ms) ?? Number.NaN,
      p95Ms: toNumber(r.p95_ms) ?? Number.NaN,
      iters,
    };
    const gflops = toNumber(r.gflops);
    if (gflops !== undefined) res.gflops = gflops;
    results.push(res);
  }
  return {
    format: "kern-bench",
    shape: { M, N, K },
    gitCommit: toStr(json.git_commit) ?? "unknown",
    device: toStr(json.device) ?? "unknown",
    driver: toStr(json.driver) ?? "unknown",
    compileFlags: toStr(json.compile_flags) ?? "unknown",
    results,
  };
}
