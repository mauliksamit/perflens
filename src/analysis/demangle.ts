// SIMPLIFIED display names for Itanium-mangled kernel names (e.g. torch on
// Windows/CUDA writes "_ZN2at6native18elementwise_kernel...").
//
// This is NOT a full demangler: it decodes only the leading
// <length><identifier> components of `_Z<name>` / `_ZN<name>...E`, plus the
// first template argument when it is itself a plain identifier, and appends
// "<…>" when more template arguments follow. Anything it cannot decode is
// returned unchanged. The full mangled name stays available (tooltips, title).

function readSourceName(s: string, i: number): { id: string; next: number } | null {
  let j = i;
  while (j < s.length && s[j]! >= "0" && s[j]! <= "9") j++;
  if (j === i) return null;
  const len = Number(s.slice(i, j));
  if (len <= 0 || j + len > s.length) return null;
  let id = s.slice(j, j + len);
  if (id.startsWith("_GLOBAL__N")) id = "(anonymous)";
  return { id, next: j + len };
}

export function displayName(name: string): string {
  if (!name.startsWith("_Z")) return name;
  let i = 2;
  const nested = name[i] === "N";
  if (nested) i++;
  const parts: string[] = [];
  for (;;) {
    const r = readSourceName(name, i);
    if (!r) break;
    parts.push(r.id);
    i = r.next;
    if (!nested) break;
  }
  if (parts.length === 0) return name;
  let out = parts.join("::");
  if (name[i] === "I") {
    const arg = readSourceName(name, i + 1);
    const rest = arg ? name[arg.next] : undefined;
    out += arg ? `<${arg.id}${rest === "E" ? "" : ", …"}>` : "<…>";
  }
  return out;
}
