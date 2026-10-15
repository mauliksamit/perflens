export function fmtUs(us: number): string {
  if (!Number.isFinite(us)) return "–";
  const a = Math.abs(us);
  if (a >= 1e6) return `${(us / 1e6).toFixed(3)} s`;
  if (a >= 1e3) return `${(us / 1e3).toFixed(3)} ms`;
  if (a >= 10) return `${us.toFixed(1)} µs`;
  return `${us.toFixed(2)} µs`;
}

export function fmtMs(ms: number): string {
  return Number.isFinite(ms) ? `${ms.toFixed(4)} ms` : "–";
}

export function fmtPct(p: number, digits = 1): string {
  return Number.isFinite(p) ? `${p.toFixed(digits)}%` : "–";
}

export function fmtSignedPct(p: number, digits = 1): string {
  if (!Number.isFinite(p)) return "–";
  return `${p >= 0 ? "+" : ""}${p.toFixed(digits)}%`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtBytes(b: number): string {
  if (b >= 1 << 20) return `${(b / (1 << 20)).toFixed(1)} MiB`;
  if (b >= 1 << 10) return `${(b / (1 << 10)).toFixed(1)} KiB`;
  return `${b} B`;
}

/** Shorten long C++ template kernel names for table cells (full name in title). */
export function shortName(name: string, max = 90): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}
