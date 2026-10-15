import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseChromeTrace } from "../src/parse/chromeTrace";
import { bytesToText, isGzip, parseText } from "../src/parse/detect";
import { ParseError, isRecord, toDim3, toNumber } from "../src/parse/guards";
import { parseKernBench } from "../src/parse/kernBench";
import { readData, readJson } from "./helpers";

describe("guards", () => {
  it("narrows records and numbers", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(toNumber(3)).toBe(3);
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber("")).toBeUndefined();
    expect(toNumber(Number.NaN)).toBeUndefined();
    expect(toNumber("abc")).toBeUndefined();
    expect(toDim3([1, "2", 3])).toEqual([1, 2, 3]);
    expect(toDim3([1, 2])).toBeUndefined();
  });
});

describe("parseChromeTrace (synthetic)", () => {
  const trace = {
    traceEvents: [
      { ph: "X", cat: "kernel", name: "gemm_a", pid: 0, tid: 7, ts: 1000, dur: 10,
        args: { device: 0, stream: 7, grid: [4, 1, 1], block: [128, 1, 1], "registers per thread": 64, "shared memory": 1024 } },
      { ph: "X", cat: "Kernel", name: "old_cat", ts: "1020.5", dur: "2", args: { device: 0, stream: 9 } },
      { ph: "X", cat: "gpu_memcpy", name: "Memcpy HtoD", ts: 990, dur: 5, args: { device: 0, stream: 7 } },
      { ph: "X", cat: "cpu_op", name: "aten::mm", ts: 980, dur: 30 },
      { ph: "X", cat: "kernel", name: "bad_dur", ts: 1, dur: -1 },
      { ph: "M", name: "process_name", args: { name: "x" } },
      { ph: "s", id: 1, cat: "ac2g", ts: 1 },
      "not an object",
    ],
    deviceProperties: [{ id: 0, name: "Test GPU" }],
  };

  it("keeps only GPU complete events, rebased to the first GPU event", () => {
    const t = parseChromeTrace(trace);
    expect(t.gpuEvents.map((e) => e.name)).toEqual(["Memcpy HtoD", "gemm_a", "old_cat"]);
    expect(t.originUs).toBe(990);
    expect(t.gpuEvents[0]!.start).toBe(0);
    expect(t.gpuEvents[1]!.start).toBe(10);
    expect(t.gpuEvents[2]!.start).toBeCloseTo(30.5);
    expect(t.spanUs).toBeCloseTo(32.5);
    expect(t.deviceNames).toEqual({ 0: "Test GPU" });
  });

  it("counts every input event exactly once", () => {
    const c = parseChromeTrace(trace).counts;
    expect(c).toEqual({ totalEvents: 8, completeEvents: 4 + 0 + 0 + 0 + 0, gpuEvents: 3, cpuOps: 1, skipped: 4 });
  });

  it("keeps launch metadata and maps old category names", () => {
    const t = parseChromeTrace(trace);
    const g = t.gpuEvents.find((e) => e.name === "gemm_a")!;
    expect(g.grid).toEqual([4, 1, 1]);
    expect(g.block).toEqual([128, 1, 1]);
    expect(g.registersPerThread).toBe(64);
    expect(g.sharedMemoryBytes).toBe(1024);
    expect(t.gpuEvents.find((e) => e.name === "old_cat")!.kind).toBe("kernel");
    expect(t.gpuEvents.find((e) => e.name === "old_cat")!.stream).toBe(9);
  });

  it("accepts the bare-array Chrome format", () => {
    const t = parseChromeTrace([{ ph: "X", cat: "kernel", name: "k", ts: 5, dur: 1 }]);
    expect(t.gpuEvents).toHaveLength(1);
  });

  it("handles a trace with no GPU events", () => {
    const t = parseChromeTrace({ traceEvents: [{ ph: "X", cat: "cpu_op", name: "a", ts: 1, dur: 1 }] });
    expect(t.gpuEvents).toHaveLength(0);
    expect(t.spanUs).toBe(0);
  });

  it("rejects non-traces", () => {
    expect(() => parseChromeTrace({ foo: 1 })).toThrow(ParseError);
  });
});

describe("parseChromeTrace (real sample)", () => {
  it("matches an independent count of GPU categories in block_eager.json", () => {
    const json = readJson("traces/block_eager.json");
    const t = parseChromeTrace(json);
    const raw = (json as { traceEvents: Array<{ ph?: string; cat?: string }> }).traceEvents;
    const expected = raw.filter(
      (e) => e.ph === "X" && ["kernel", "gpu_memcpy", "gpu_memset"].includes((e.cat ?? "").toLowerCase()),
    ).length;
    expect(expected).toBeGreaterThan(0);
    expect(t.gpuEvents).toHaveLength(expected);
    expect(t.counts.totalEvents).toBe(raw.length);
    expect(Object.values(t.deviceNames)[0]).toContain("NVIDIA");
    for (let i = 1; i < t.gpuEvents.length; i++) {
      expect(t.gpuEvents[i]!.start).toBeGreaterThanOrEqual(t.gpuEvents[i - 1]!.start);
    }
  });
});

describe("parseKernBench", () => {
  it("parses the real kern run V sample", () => {
    const b = parseKernBench(readJson("kern/bench_M1024_runV_strict.json"));
    expect(b.shape).toEqual({ M: 1024, N: 1024, K: 1024 });
    expect(b.results.map((r) => r.kernel)).toContain("cublas");
    for (const r of b.results) {
      expect(r.failed).toBe(false);
      expect(r.iters.length).toBe(100);
      expect(r.medianMs).toBeGreaterThan(0);
    }
    expect(b.compileFlags).not.toContain("fast_math");
  });

  it("marks failed and skipped entries", () => {
    const b = parseKernBench({ M: 1, N: 1, K: 1, results: [
      { kernel: "a", failed: true }, { kernel: "b", skipped: true }, { kernel: "c", median_ms: 1, iters: [1, "x", 2] },
    ] });
    expect(b.results.map((r) => r.failed)).toEqual([true, true, false]);
    expect(b.results[2]!.iters).toEqual([1, 2]);
  });

  it("rejects files without M/N/K", () => {
    expect(() => parseKernBench({ results: [] })).toThrow(ParseError);
  });
});

describe("detect", () => {
  it("routes kern JSON and traces, rejects other JSON and bad JSON", () => {
    expect(parseText(readData("kern/bench_M1024_runN_fastmath.json").toString()).format).toBe("kern-bench");
    expect(parseText('{"traceEvents": []}').format).toBe("chrome-trace");
    expect(() => parseText('{"hello": 1}')).toThrow(/unrecognised/);
    expect(() => parseText("{nope")).toThrow(/invalid JSON/);
  });

  it("transparently gunzips", async () => {
    const plain = Buffer.from('{"traceEvents": []}');
    const gz = new Uint8Array(gzipSync(plain));
    expect(isGzip(gz)).toBe(true);
    expect(isGzip(new Uint8Array(plain))).toBe(false);
    expect(await bytesToText(gz)).toBe(plain.toString());
  });
});
