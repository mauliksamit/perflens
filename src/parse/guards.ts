// Type guards for untrusted JSON. Parsers take `unknown` and narrow with
// these helpers; nothing in src/parse uses `any`.

export type JsonRecord = Record<string, unknown>;

export function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Finite number, or a numeric string (some trace writers quote ts/dur). */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function toStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** [x, y, z] of finite numbers, else undefined. */
export function toDim3(v: unknown): [number, number, number] | undefined {
  if (!Array.isArray(v) || v.length !== 3) return undefined;
  const a = toNumber(v[0]);
  const b = toNumber(v[1]);
  const c = toNumber(v[2]);
  return a !== undefined && b !== undefined && c !== undefined ? [a, b, c] : undefined;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}
