import { describe, expect, it } from "vitest";
import { analyzeBytes, sampleGroups } from "../src/analysis/analyze";
import { bucketTotals, classifyKernel } from "../src/analysis/classify";
import { displayName } from "../src/analysis/demangle";
import { compareGroups, compareSamples, DEFAULT_COMPARE } from "../src/analysis/compare";
import { idleGaps } from "../src/analysis/idleGaps";
import { median, mulberry32, percentile } from "../src/analysis/stats";
import { topKernels } from "../src/analysis/topKernels";
import { lowerBound, panView, tickStep, zoomView } from "../src/ui/timelineMath";
import { ev, readData } from "./helpers";

describe("stats", () => {
  it("median and percentile", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
    expect(percentile([0, 10], 25)).toBe(2.5);
  });
  it("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("topKernels", () => {
  it("groups by name+kind and ranks by total", () => {
    const t = topKernels([
      ev({ name: "a", start: 0, dur: 1 }), ev({ name: "a", start: 2, dur: 3 }),
      ev({ name: "b", start: 5, dur: 10 }), ev({ name: "a", kind: "memcpy", start: 20, dur: 1 }),
    ]);
    expect(t.map((k) => [k.name, k.kind, k.count, k.totalUs])).toEqual([
      ["b", "kernel", 1, 10], ["a", "kernel", 2, 4], ["a", "memcpy", 1, 1],
    ]);
    expect(t[1]!.medianUs).toBe(2);
    expect(t.reduce((s, k) => s + k.sharePct, 0)).toBeCloseTo(100);
  });
});

describe("idleGaps", () => {
  it("unions overlapping streams before finding gaps", () => {
    const d = idleGaps([
      ev({ name: "s1a", stream: 1, start: 0, dur: 10 }),
      ev({ name: "s2a", stream: 2, start: 5, dur: 10 }), // overlaps -> busy 0..15
      ev({ name: "s1b", stream: 1, start: 25, dur: 5 }), // gap 15..25
      ev({ name: "nested", stream: 2, start: 26, dur: 1 }), // inside s1b
      ev({ name: "s1c", stream: 1, start: 31, dur: 4 }), // gap 30..31 (1 us, not listed)
    ], 5)[0]!;
    expect(d.windowUs).toBe(35);
    expect(d.busyUs).toBe(15 + 5 + 4);
    expect(d.idleUs).toBe(11);
    expect(d.gapCount).toBe(2);
    expect(d.listed).toEqual([{ device: 0, start: 15, dur: 10, before: "s2a", after: "s1b" }]);
  });

  it("separates devices and handles single events", () => {
    const r = idleGaps([ev({ device: 1, start: 0, dur: 2 }), ev({ device: 0, start: 0, dur: 3 })]);
    expect(r.map((d) => [d.device, d.busyUs, d.idleUs])).toEqual([[0, 3, 0], [1, 2, 0]]);
  });

  it("gap 'before' is the event that ends last, not the one that started last", () => {
    const d = idleGaps([
      ev({ name: "long", start: 0, dur: 100 }),
      ev({ name: "short", stream: 2, start: 10, dur: 5 }),
      ev({ name: "next", start: 120, dur: 1 }),
    ])[0]!;
    expect(d.listed[0]).toMatchObject({ before: "long", after: "next", start: 100, dur: 20 });
  });
});

describe("classify (heuristic)", () => {
  it("buckets common kernel names", () => {
    expect(classifyKernel({ kind: "kernel", name: "void cutlass::Kernel2<cutlass_80_simt_sgemm_128x64>" })).toBe("gemm");
    expect(classifyKernel({ kind: "kernel", name: "pytorch_flash::flash_fwd_kernel<...>" })).toBe("attention");
    expect(classifyKernel({ kind: "kernel", name: "void at::native::(anonymous namespace)::softmax_warp_forward" })).toBe("softmax");
    expect(classifyKernel({ kind: "kernel", name: "void at::native::vectorized_layer_norm_kernel<float>" })).toBe("normalization");
    expect(classifyKernel({ kind: "kernel", name: "void at::native::vectorized_elementwise_kernel<4, GeluCUDAKernelImpl>" })).toBe("elementwise");
    expect(classifyKernel({ kind: "kernel", name: "mystery" })).toBe("other");
    expect(classifyKernel({ kind: "memcpy", name: "Memcpy HtoD" })).toBe("memcpy/memset");
  });
  it("bucket shares sum to 100", () => {
    const b = bucketTotals([ev({ name: "sgemm", start: 0, dur: 3 }), ev({ name: "x", start: 0, dur: 1 })]);
    expect(b.reduce((s, x) => s + x.sharePct, 0)).toBeCloseTo(100);
    expect(b[0]!.bucket).toBe("gemm");
  });
});

describe("compare", () => {
  const noisy = (base: number, n: number, seed: number, spread = 0.02) => {
    const r = mulberry32(seed);
    return Array.from({ length: n }, () => base * (1 + spread * (r() - 0.5)));
  };

  it("same distribution -> inconclusive", () => {
    const c = compareSamples("k", noisy(1, 100, 1), noisy(1, 100, 2));
    expect(c.verdict).toBe("inconclusive");
    expect(c.ciLowPct).toBeLessThanOrEqual(0);
    expect(c.ciHighPct).toBeGreaterThanOrEqual(0);
  });

  it("clear 20% slowdown -> slower; 20% speedup -> faster", () => {
    expect(compareSamples("k", noisy(1, 100, 1), noisy(1.2, 100, 2)).verdict).toBe("slower");
    expect(compareSamples("k", noisy(1.2, 100, 1), noisy(1, 100, 2)).verdict).toBe("faster");
  });

  it("real but small (2%) change stays inconclusive under the 5% threshold", () => {
    const c = compareSamples("k", noisy(1, 200, 1, 0.001), noisy(1.02, 200, 2, 0.001));
    expect(c.ciLowPct).toBeGreaterThan(0); // statistically clear...
    expect(c.verdict).toBe("inconclusive"); // ...but below the practical threshold
    expect(c.reason).toMatch(/threshold/);
    expect(compareSamples("k", noisy(1, 200, 1, 0.001), noisy(1.02, 200, 2, 0.001),
      { ...DEFAULT_COMPARE, thresholdPct: 1 }).verdict).toBe("slower");
  });

  it("too few samples -> inconclusive", () => {
    const c = compareSamples("k", [1, 1], [2, 2]);
    expect(c.verdict).toBe("inconclusive");
    expect(c.reason).toMatch(/fewer than/);
  });

  it("is deterministic", () => {
    const a = noisy(1, 50, 3, 0.2);
    const b = noisy(1.05, 50, 4, 0.2);
    expect(compareSamples("k", a, b)).toEqual(compareSamples("k", a, b));
  });

  it("reports keys present on one side only", () => {
    const r = compareGroups(new Map([["a", [1]], ["b", [1]]]), new Map([["b", [1]], ["c", [1]]]));
    expect(r.rows.map((x) => x.key)).toEqual(["b"]);
    expect(r.onlyA).toEqual(["a"]);
    expect(r.onlyB).toEqual(["c"]);
  });
});

describe("analyzeBytes on real samples", () => {
  it("analyzes the gzipped large trace and the kern pair", async () => {
    const big = await analyzeBytes("big", new Uint8Array(readData("traces/block_eager_300steps.json.gz")));
    expect(big.file.format).toBe("chrome-trace");
    if (big.file.format !== "chrome-trace" || !big.analysis) throw new Error("expected trace");
    expect(big.file.counts.gpuEvents).toBeGreaterThan(1000);
    expect(big.analysis.top.length).toBeGreaterThan(0);
    expect(big.analysis.idle).toHaveLength(1);

    const v = await analyzeBytes("V", new Uint8Array(readData("kern/bench_M1024_runV_strict.json")));
    const n = await analyzeBytes("N", new Uint8Array(readData("kern/bench_M1024_runN_fastmath.json")));
    const r = compareGroups(sampleGroups(n), sampleGroups(v));
    expect(r.rows).toHaveLength(8);
    for (const row of r.rows) expect(["faster", "slower", "inconclusive"]).toContain(row.verdict);
  });
});

describe("timeline math", () => {
  it("zoom keeps the anchor fixed and clamps span", () => {
    const v = zoomView({ t0: 0, t1: 100 }, 2, 25);
    expect(v.t1 - v.t0).toBe(50);
    expect((25 - v.t0) / (v.t1 - v.t0)).toBeCloseTo(0.25);
    expect(zoomView({ t0: 0, t1: 1 }, 100, 0.5, 0.5).t1 - zoomView({ t0: 0, t1: 1 }, 100, 0.5, 0.5).t0).toBe(0.5);
  });
  it("pan, tick step, lowerBound", () => {
    expect(panView({ t0: 0, t1: 10 }, 5)).toEqual({ t0: 5, t1: 15 });
    expect(tickStep(1000)).toBe(100);
    expect(tickStep(7)).toBe(1);
    expect(lowerBound([1, 3, 3, 7], 3)).toBe(1);
    expect(lowerBound([1, 3, 3, 7], 8)).toBe(4);
    expect(lowerBound([], 1)).toBe(0);
  });
});

describe("displayName (simplified demangling)", () => {
  it("decodes leading source names and the first plain template argument", () => {
    expect(displayName("_Z20magma_sgemmEx_kernelIfffLb1ELb0ELi6EEviii")).toBe("magma_sgemmEx_kernel<…>");
    expect(displayName("_ZN2at6native18elementwise_kernelILi128ELi2EZNS0_22gpu")).toBe("at::native::elementwise_kernel<…>");
    expect(displayName("_ZN7cutlass7Kernel2I41cutlass_80_simt_sgemm_64x64_8x5_nn_align1EEvNT_6ParamsE"))
      .toBe("cutlass::Kernel2<cutlass_80_simt_sgemm_64x64_8x5_nn_align1>");
    expect(displayName("_ZN2at6native53_GLOBAL__N__e58679f9_20_layer_norm_kernel_cu_3ff0b71f28vectorized_layer_norm_kernelIffEEviT0_PKT_"))
      .toBe("at::native::(anonymous)::vectorized_layer_norm_kernel<…>");
    expect(displayName("Memcpy DtoD (Device -> Device)")).toBe("Memcpy DtoD (Device -> Device)");
    expect(displayName("_Zgarbage")).toBe("_Zgarbage");
    expect(displayName("_Z999toolong")).toBe("_Z999toolong");
  });
});
