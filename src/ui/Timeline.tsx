// Zoomable GPU timeline drawn on a canvas: one lane per (device, stream),
// plus an "idle" lane showing the listed gaps from idleGaps(). Wheel = zoom
// around the cursor, drag = pan, double-click or Reset = full span.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyKernel, type Bucket } from "../analysis/classify";
import { displayName } from "../analysis/demangle";
import type { Gap } from "../analysis/idleGaps";
import type { GpuEvent } from "../model/types";
import { fmtUs, shortName } from "./format";
import { lowerBound, panView, tickStep, zoomView, type View } from "./timelineMath";

const LABEL_W = 120;
const LANE_H = 22;
const AXIS_H = 22;

export const BUCKET_COLORS: Record<Bucket, string> = {
  gemm: "#4c78a8",
  attention: "#f58518",
  normalization: "#54a24b",
  softmax: "#e45756",
  elementwise: "#72b7b2",
  reduction: "#b279a2",
  "memcpy/memset": "#9d755d",
  other: "#8c8c8c",
};

interface Lane {
  key: string;
  label: string;
  events: GpuEvent[];
  starts: Float64Array;
  maxDur: number;
}

export function Timeline({ events, spanUs, gaps }: { events: GpuEvent[]; spanUs: number; gaps: Gap[] }) {
  const lanes = useMemo<Lane[]>(() => {
    const m = new Map<string, GpuEvent[]>();
    for (const e of events) {
      const k = `${e.device}:${e.stream}`;
      const l = m.get(k) ?? [];
      l.push(e);
      m.set(k, l);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([key, evs]) => {
        const [dev, stream] = key.split(":");
        return {
          key,
          label: `GPU ${dev} · stream ${stream}`,
          events: evs,
          starts: Float64Array.from(evs, (e) => e.start),
          maxDur: evs.reduce((mx, e) => Math.max(mx, e.dur), 0),
        };
      });
  }, [events]);

  const full: View = useMemo(() => ({ t0: 0, t1: Math.max(spanUs, 1) }), [spanUs]);
  const [view, setView] = useState<View>(full);
  useEffect(() => setView(full), [full]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<{ x: number; y: number; e: GpuEvent } | null>(null);
  const drag = useRef<{ x: number; view: View } | null>(null);

  const height = AXIS_H + LANE_H * (lanes.length + 1) + 4;
  const plotW = Math.max(50, width - LABEL_W);
  const toX = useCallback((t: number) => LABEL_W + ((t - view.t0) / (view.t1 - view.t0)) * plotW, [view, plotW]);
  const toT = useCallback((x: number) => view.t0 + ((x - LABEL_W) / plotW) * (view.t1 - view.t0), [view, plotW]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(width * dpr);
    c.height = Math.floor(height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(c);
    const fg = css.getPropertyValue("--fg").trim() || "#222";
    const grid = css.getPropertyValue("--grid").trim() || "#ddd";
    ctx.clearRect(0, 0, width, height);
    ctx.font = "11px system-ui, sans-serif";

    // axis + grid
    const step = tickStep(view.t1 - view.t0);
    ctx.fillStyle = fg;
    ctx.strokeStyle = grid;
    for (let t = Math.ceil(view.t0 / step) * step; t <= view.t1; t += step) {
      const x = toX(t);
      ctx.beginPath();
      ctx.moveTo(x, AXIS_H - 4);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(fmtUs(t), x + 2, 12);
    }

    // idle lane
    const idleY = AXIS_H;
    ctx.fillStyle = fg;
    ctx.fillText("idle gaps", 6, idleY + 15);
    ctx.fillStyle = "#d62728";
    for (const g of gaps) {
      if (g.start + g.dur < view.t0 || g.start > view.t1) continue;
      const x0 = Math.max(LABEL_W, toX(g.start));
      const x1 = Math.min(width, toX(g.start + g.dur));
      ctx.fillRect(x0, idleY + 5, Math.max(1, x1 - x0), LANE_H - 10);
    }

    lanes.forEach((lane, i) => {
      const y = AXIS_H + LANE_H * (i + 1);
      ctx.fillStyle = fg;
      ctx.fillText(lane.label, 6, y + 15);
      let idx = lowerBound(lane.starts, view.t0 - lane.maxDur);
      let lastX = -1;
      for (; idx < lane.events.length; idx++) {
        const e = lane.events[idx]!;
        if (e.start > view.t1) break;
        if (e.start + e.dur < view.t0) continue;
        const x0 = Math.max(LABEL_W, toX(e.start));
        const x1 = Math.min(width, toX(e.start + e.dur));
        // Sub-pixel events in the same pixel column are drawn once.
        if (x1 - x0 < 1 && Math.floor(x0) === lastX) continue;
        lastX = Math.floor(x0);
        ctx.fillStyle = BUCKET_COLORS[classifyKernel(e)];
        ctx.fillRect(x0, y + 3, Math.max(1, x1 - x0), LANE_H - 6);
      }
    });
  }, [lanes, gaps, view, width, height, toX]);

  const onWheel = (ev: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const t = toT(ev.clientX - rect.left);
    setView((v) => zoomView(v, ev.deltaY < 0 ? 1.25 : 0.8, t, 0.5, full.t1 * 1.5));
  };
  const onMouseDown = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    drag.current = { x: ev.clientX, view };
  };
  const onMouseUp = () => {
    drag.current = null;
  };
  const onMouseMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (drag.current) {
      const d = drag.current;
      const dt = ((d.x - ev.clientX) / plotW) * (d.view.t1 - d.view.t0);
      setView(panView(d.view, dt));
      return;
    }
    const laneIdx = Math.floor((y - AXIS_H) / LANE_H) - 1;
    const lane = lanes[laneIdx];
    if (!lane || x < LABEL_W) {
      setHover(null);
      return;
    }
    const t = toT(x);
    const tol = ((view.t1 - view.t0) / plotW) * 2;
    let found: GpuEvent | null = null;
    for (let i = lowerBound(lane.starts, t - lane.maxDur - tol); i < lane.events.length; i++) {
      const e = lane.events[i]!;
      if (e.start > t + tol) break;
      if (e.start - tol <= t && t <= e.start + e.dur + tol) found = e;
    }
    setHover(found ? { x, y, e: found } : null);
  };

  const zoomBy = (f: number) => setView((v) => zoomView(v, f, (v.t0 + v.t1) / 2, 0.5, full.t1 * 1.5));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Timeline</h2>
        <div className="toolbar">
          <button type="button" onClick={() => zoomBy(2)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomBy(0.5)} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setView(full)}>Reset</button>
          <span className="muted" data-testid="timeline-view">
            {fmtUs(view.t0)} – {fmtUs(view.t1)} ({fmtUs(view.t1 - view.t0)} shown)
          </span>
        </div>
      </div>
      <div className="timeline-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          data-testid="timeline-canvas"
          style={{ width: `${width}px`, height: `${height}px` }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            onMouseUp();
            setHover(null);
          }}
          onMouseMove={onMouseMove}
          onDoubleClick={() => setView(full)}
          role="img"
          aria-label={`GPU timeline with ${lanes.length} stream lanes and ${events.length} events`}
        />
        {hover && (
          <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 320), top: hover.y + 12 }}>
            <div className="mono">{shortName(displayName(hover.e.name), 120)}</div>
            <div>
              {hover.e.kind} · {fmtUs(hover.e.dur)} · starts {fmtUs(hover.e.start)}
            </div>
            {hover.e.grid && hover.e.block && (
              <div>
                grid {hover.e.grid.join("×")} · block {hover.e.block.join("×")}
                {hover.e.registersPerThread !== undefined && ` · ${hover.e.registersPerThread} regs`}
              </div>
            )}
            <div className="muted">color: {classifyKernel(hover.e)} (heuristic)</div>
          </div>
        )}
      </div>
      <div className="legend">
        {Object.entries(BUCKET_COLORS).map(([b, c]) => (
          <span key={b}>
            <i style={{ background: c }} /> {b}
          </span>
        ))}
        <span className="muted">colors use a name-based heuristic</span>
      </div>
    </section>
  );
}
