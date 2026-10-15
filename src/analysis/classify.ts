// HEURISTIC kernel-name classification.
//
// Groups GPU time into coarse buckets (GEMM, attention, normalization, ...) by
// matching substrings of kernel names. Kernel names are library- and
// version-specific, so this is a labeled heuristic: it can misfile kernels,
// and the UI always shows it as "heuristic". It never feeds a measurement.
import type { GpuEvent } from "../model/types";

export type Bucket =
  | "gemm"
  | "attention"
  | "normalization"
  | "softmax"
  | "elementwise"
  | "reduction"
  | "memcpy/memset"
  | "other";

// Order matters: first match wins (attention kernels often contain "gemm").
const RULES: Array<[Bucket, RegExp]> = [
  ["attention", /flash|fmha|attention|attn|sdpa|efficient_attention/i],
  ["gemm", /gemm|sgemm|hgemm|cutlass|cublas|matmul|xmma|ampere_.*_tn|sm\d+_xmma|gemv|dot_kernel/i],
  ["softmax", /softmax/i],
  ["normalization", /layer_?norm|rms_?norm|batch_?norm|group_?norm/i],
  ["reduction", /reduce|reduction|sum_kernel|argmax|cumsum|scan/i],
  ["elementwise", /elementwise|vectorized_|unrolled_|pointwise|gelu|silu|relu|add_kernel|mul_kernel|copy_kernel|fill_kernel|cat_|index|gather|scatter|triton_poi/i],
];

export function classifyKernel(e: Pick<GpuEvent, "name" | "kind">): Bucket {
  if (e.kind !== "kernel") return "memcpy/memset";
  for (const [bucket, re] of RULES) if (re.test(e.name)) return bucket;
  return "other";
}

export interface BucketTotal {
  bucket: Bucket;
  totalUs: number;
  count: number;
  sharePct: number;
}

export function bucketTotals(events: readonly GpuEvent[]): BucketTotal[] {
  const m = new Map<Bucket, { totalUs: number; count: number }>();
  let all = 0;
  for (const e of events) {
    const b = classifyKernel(e);
    const t = m.get(b) ?? { totalUs: 0, count: 0 };
    t.totalUs += e.dur;
    t.count++;
    m.set(b, t);
    all += e.dur;
  }
  return [...m]
    .map(([bucket, t]) => ({ bucket, ...t, sharePct: all > 0 ? (100 * t.totalUs) / all : 0 }))
    .sort((a, b) => b.totalUs - a.totalUs);
}
