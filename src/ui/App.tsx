import { useEffect, useState } from "react";
import type { Analyzed } from "../analysis/analyze";
import { isRecord, toStr } from "../parse/guards";
import { analyzeInWorker } from "../worker/client";
import { BenchView } from "./BenchView";
import { ComparePanel } from "./ComparePanel";
import { fmtBytes, fmtInt } from "./format";
import { TraceView } from "./TraceView";

interface Sample {
  file: string;
  label: string;
  description: string;
}

function parseManifest(json: unknown): Sample[] {
  if (!isRecord(json) || !Array.isArray(json.samples)) return [];
  const out: Sample[] = [];
  for (const s of json.samples) {
    if (!isRecord(s)) continue;
    const file = toStr(s.file);
    const label = toStr(s.label);
    if (file && label) out.push({ file, label, description: toStr(s.description) ?? "" });
  }
  return out;
}

export function App() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [runs, setRuns] = useState<Analyzed[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}samples.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => setSamples(parseManifest(j)))
      .catch(() => setSamples([]));
  }, []);

  async function load(name: string, buffer: ArrayBuffer) {
    setBusy(name);
    setError(null);
    try {
      const result = await analyzeInWorker(name, buffer);
      setRuns((rs) => {
        setActive(rs.length);
        return [...rs, result];
      });
    } catch (e) {
      setError(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function loadSample(s: Sample) {
    const r = await fetch(`${import.meta.env.BASE_URL}${s.file}`);
    if (!r.ok) {
      setError(`${s.file}: HTTP ${r.status}`);
      return;
    }
    await load(s.label, await r.arrayBuffer());
  }

  async function loadFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) await load(f.name, await f.arrayBuffer());
  }

  const cur = runs[active];
  return (
    <div
      className={`app ${dragOver ? "drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void loadFiles(e.dataTransfer.files);
      }}
    >
      <header>
        <h1>perflens</h1>
        <p className="muted">
          Explore PyTorch profiler Chrome traces and kern CUDA benchmark JSON. Files are parsed in a Web Worker in your
          browser and never uploaded.
        </p>
      </header>

      <section className="panel">
        <div className="toolbar">
          <label className="file-btn">
            Open file(s)…
            <input type="file" accept=".json,.gz,application/json" multiple data-testid="file-input"
              onChange={(e) => void loadFiles(e.target.files)} />
          </label>
          <span className="muted">or drop .json / .json.gz here · samples:</span>
          {samples.map((s) => (
            <button key={s.file} type="button" title={s.description} onClick={() => void loadSample(s)}>
              {s.label}
            </button>
          ))}
        </div>
        {busy && <p data-testid="busy">Parsing {busy} in a Web Worker…</p>}
        {error && <p className="warn" role="alert">{error}</p>}
      </section>

      {runs.length > 0 && (
        <nav className="tabs" aria-label="Loaded files">
          {runs.map((r, i) => (
            <button key={i} type="button" className={i === active ? "on" : ""} onClick={() => setActive(i)}>
              {r.name}
            </button>
          ))}
        </nav>
      )}

      {cur && (
        <>
          <p className="muted" data-testid="parse-stats" data-events={cur.file.format === "chrome-trace" ? cur.file.counts.totalEvents : cur.file.results.length}
            data-parse-ms={(cur.timings.decodeMs + cur.timings.parseMs + cur.timings.analyzeMs).toFixed(2)}>
            {cur.file.format === "chrome-trace"
              ? `${fmtInt(cur.file.counts.totalEvents)} trace events (${fmtInt(cur.file.counts.gpuEvents)} GPU, ${fmtInt(cur.file.counts.cpuOps)} CPU ops, ${fmtInt(cur.file.counts.skipped)} skipped)`
              : `kern bench JSON, ${cur.file.results.length} kernels`}
            {" · "}
            {fmtBytes(cur.bytes)} · decode {cur.timings.decodeMs.toFixed(1)} ms, parse {cur.timings.parseMs.toFixed(1)} ms,
            analyze {cur.timings.analyzeMs.toFixed(1)} ms (in Web Worker)
          </p>
          {cur.file.format === "chrome-trace" && cur.analysis ? (
            <TraceView file={cur.file} analysis={cur.analysis} />
          ) : cur.file.format === "kern-bench" ? (
            <BenchView file={cur.file} />
          ) : null}
        </>
      )}

      {runs.length >= 2 && <ComparePanel runs={runs} />}

      <footer className="muted">
        perflens reads PyTorch Chrome traces and kern JSON only. It makes no claims about Nsight, Trainium or Neuron data.
      </footer>
    </div>
  );
}
