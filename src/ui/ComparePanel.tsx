import { useMemo, useState } from "react";
import { sampleGroups, type Analyzed } from "../analysis/analyze";
import { DEFAULT_COMPARE, compareGroups } from "../analysis/compare";
import { displayName } from "../analysis/demangle";
import { fmtInt, fmtSignedPct, fmtUs, shortName } from "./format";

export function ComparePanel({ runs }: { runs: Analyzed[] }) {
  const [ia, setIa] = useState(0);
  const [ib, setIb] = useState(Math.min(1, runs.length - 1));
  const [threshold, setThreshold] = useState(DEFAULT_COMPARE.thresholdPct);
  const a = runs[ia];
  const b = runs[ib];
  const sameFormat = a !== undefined && b !== undefined && a.file.format === b.file.format;

  const result = useMemo(() => {
    if (!a || !b || !sameFormat) return null;
    return compareGroups(sampleGroups(a), sampleGroups(b), { ...DEFAULT_COMPARE, thresholdPct: threshold });
  }, [a, b, sameFormat, threshold]);

  const unit = a?.file.format === "kern-bench" ? "ms" : "µs";
  const fmt = (x: number) => (unit === "ms" ? `${x.toFixed(4)} ms` : fmtUs(x));

  return (
    <section className="panel" data-testid="compare">
      <h2>Compare runs</h2>
      <p className="muted">
        Change = median(B) / median(A) − 1 per item (positive = B slower). A verdict needs the 95% bootstrap CI of
        that ratio to exclude “no change” <em>and</em> |change| ≥ threshold; anything else is labeled{" "}
        <strong>inconclusive</strong>.
      </p>
      <div className="toolbar">
        <label>
          A{" "}
          <select value={ia} onChange={(e) => setIa(Number(e.target.value))} data-testid="compare-a">
            {runs.map((r, i) => <option key={i} value={i}>{r.name}</option>)}
          </select>
        </label>
        <label>
          B{" "}
          <select value={ib} onChange={(e) => setIb(Number(e.target.value))} data-testid="compare-b">
            {runs.map((r, i) => <option key={i} value={i}>{r.name}</option>)}
          </select>
        </label>
        <label>
          threshold{" "}
          <input type="number" min={0} max={100} step={0.5} value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: "4.5em" }} /> %
        </label>
      </div>
      {!sameFormat && <p className="warn">A and B must be the same kind of file (both traces or both kern JSON).</p>}
      {result && (
        <>
          <table data-testid="compare-table">
            <thead>
              <tr>
                <th>item</th><th className="num">n A</th><th className="num">n B</th>
                <th className="num">median A</th><th className="num">median B</th>
                <th className="num">change</th><th className="num">95% CI</th><th>verdict</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.key}>
                  <td className="mono" title={r.key}>{shortName(displayName(r.key), 60)}</td>
                  <td className="num">{fmtInt(r.nA)}</td>
                  <td className="num">{fmtInt(r.nB)}</td>
                  <td className="num">{fmt(r.medianA)}</td>
                  <td className="num">{fmt(r.medianB)}</td>
                  <td className="num">{fmtSignedPct(r.changePct)}</td>
                  <td className="num">
                    {Number.isFinite(r.ciLowPct) ? `${fmtSignedPct(r.ciLowPct)} … ${fmtSignedPct(r.ciHighPct)}` : "–"}
                  </td>
                  <td title={r.reason}>
                    <span className={`verdict v-${r.verdict}`}>{r.verdict}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(result.onlyA.length > 0 || result.onlyB.length > 0) && (
            <p className="muted">
              Only in A: {result.onlyA.length} · only in B: {result.onlyB.length} (not compared)
            </p>
          )}
        </>
      )}
    </section>
  );
}
