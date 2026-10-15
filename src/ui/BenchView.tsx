import type { BenchRun } from "../model/types";
import { fmtInt, fmtMs } from "./format";

export function BenchView({ file }: { file: BenchRun }) {
  const ok = file.results.filter((r) => !r.failed);
  const best = Math.min(...ok.map((r) => r.medianMs));
  return (
    <section className="panel">
      <h2>
        kern benchmark {file.shape.M}×{file.shape.N}×{file.shape.K}
      </h2>
      <p className="muted">
        {file.device} · driver {file.driver} · kern commit <span className="mono">{file.gitCommit}</span> · flags{" "}
        <span className="mono">{file.compileFlags}</span>
      </p>
      <table data-testid="bench-table">
        <thead>
          <tr>
            <th>kernel</th><th className="num">median</th><th className="num">min</th><th className="num">p95</th>
            <th className="num">GFLOPS</th><th className="num">samples</th><th>relative time</th>
          </tr>
        </thead>
        <tbody>
          {file.results.map((r) => (
            <tr key={r.kernel}>
              <td className="mono">{r.kernel}</td>
              {r.failed ? (
                <td colSpan={6} className="muted">failed / skipped in this run</td>
              ) : (
                <>
                  <td className="num">{fmtMs(r.medianMs)}</td>
                  <td className="num">{fmtMs(r.minMs)}</td>
                  <td className="num">{fmtMs(r.p95Ms)}</td>
                  <td className="num">{r.gflops !== undefined ? r.gflops.toFixed(1) : "–"}</td>
                  <td className="num">{fmtInt(r.iters.length)}</td>
                  <td>
                    <div className="bar" style={{ width: `${Math.min(100, (100 * best) / r.medianMs)}%` }} />
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Bar = fastest median / this median (longer is faster). Values are kern's own cudaEvent numbers.</p>
    </section>
  );
}
