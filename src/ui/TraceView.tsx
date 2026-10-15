import { useMemo, useState } from "react";
import type { TraceAnalysis } from "../analysis/analyze";
import { displayName } from "../analysis/demangle";
import type { TraceModel } from "../model/types";
import { fmtInt, fmtPct, fmtUs, shortName } from "./format";
import { BUCKET_COLORS, Timeline } from "./Timeline";

export function TraceView({ file, analysis }: { file: TraceModel; analysis: TraceAnalysis }) {
  const [topN, setTopN] = useState(15);
  const gaps = useMemo(() => analysis.idle.flatMap((d) => d.listed), [analysis]);
  const devNames = Object.entries(file.deviceNames).map(([id, n]) => `GPU ${id}: ${n}`).join(" · ");

  return (
    <>
      <p className="muted">
        {devNames || "device names not recorded in trace"} · GPU span {fmtUs(file.spanUs)} ·{" "}
        {fmtInt(file.counts.gpuEvents)} GPU events
      </p>
      <Timeline events={file.gpuEvents} spanUs={file.spanUs} gaps={gaps} />

      <section className="panel">
        <div className="panel-head">
          <h2>Top kernels</h2>
          <label>
            show{" "}
            <select value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
              {[10, 15, 25, 50, 1000].map((n) => (
                <option key={n} value={n}>{n === 1000 ? "all" : n}</option>
              ))}
            </select>
          </label>
        </div>
        <table data-testid="top-kernels">
          <thead>
            <tr>
              <th>#</th><th>name</th><th>kind</th><th className="num">calls</th><th className="num">total</th>
              <th className="num">median</th><th className="num">min</th><th className="num">max</th>
              <th className="num">share of GPU time</th>
            </tr>
          </thead>
          <tbody>
            {analysis.top.slice(0, topN).map((k, i) => (
              <tr key={`${k.kind}:${k.name}`}>
                <td>{i + 1}</td>
                <td className="mono" title={k.name}>{shortName(displayName(k.name))}</td>
                <td>{k.kind}</td>
                <td className="num">{fmtInt(k.count)}</td>
                <td className="num">{fmtUs(k.totalUs)}</td>
                <td className="num">{fmtUs(k.medianUs)}</td>
                <td className="num">{fmtUs(k.minUs)}</td>
                <td className="num">{fmtUs(k.maxUs)}</td>
                <td className="num">{fmtPct(k.sharePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Share = kernel time / summed GPU event time (streams can overlap, so this is not wall time). Mangled names are shown simplified (src/analysis/demangle.ts); hover a name for the full string.</p>
      </section>

      <section className="panel" data-testid="idle-gaps">
        <h2>GPU idle gaps</h2>
        <p className="muted">
          Idle = time inside the GPU window (first GPU event start to last GPU event end) with no kernel, memcpy or
          memset on any stream of that device. It does not measure SM utilization inside a running kernel.
        </p>
        {analysis.idle.map((d) => (
          <div key={d.device}>
            <table>
              <tbody>
                <tr><th>device</th><td>GPU {d.device}</td><th>window</th><td>{fmtUs(d.windowUs)}</td></tr>
                <tr><th>busy</th><td>{fmtUs(d.busyUs)}</td><th>idle</th><td data-testid="idle-pct">{fmtUs(d.idleUs)} ({fmtPct(d.idlePct)})</td></tr>
                <tr><th>gaps</th><td>{fmtInt(d.gapCount)}</td><th>listed (≥ 5 µs)</th><td>{fmtInt(d.listed.length)}</td></tr>
              </tbody>
            </table>
            {d.listed.length > 0 && (
              <table>
                <thead>
                  <tr><th className="num">gap</th><th className="num">at</th><th>after</th><th>before</th></tr>
                </thead>
                <tbody>
                  {d.listed.slice(0, 10).map((g) => (
                    <tr key={g.start}>
                      <td className="num">{fmtUs(g.dur)}</td>
                      <td className="num">{fmtUs(g.start)}</td>
                      <td className="mono" title={g.before}>{shortName(displayName(g.before), 50)}</td>
                      <td className="mono" title={g.after}>{shortName(displayName(g.after), 50)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Time by kernel category <span className="badge">heuristic</span></h2>
        <p className="muted">Categories come from substring rules on kernel names (src/analysis/classify.ts) and can misfile kernels.</p>
        <table data-testid="buckets">
          <thead>
            <tr><th>category</th><th className="num">events</th><th className="num">total</th><th className="num">share</th></tr>
          </thead>
          <tbody>
            {analysis.buckets.map((b) => (
              <tr key={b.bucket}>
                <td><i className="swatch" style={{ background: BUCKET_COLORS[b.bucket] }} /> {b.bucket}</td>
                <td className="num">{fmtInt(b.count)}</td>
                <td className="num">{fmtUs(b.totalUs)}</td>
                <td className="num">{fmtPct(b.sharePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
