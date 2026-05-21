/** Basic G-code token validation for MDI / file preview (not a full ISO parser). */

export function stripComments(line: string): string {
  let s = line.trim();
  const semi = s.indexOf(";");
  if (semi >= 0) s = s.slice(0, semi).trim();
  while (s.includes("(")) {
    const start = s.indexOf("(");
    const end = s.indexOf(")", start);
    if (end < 0) s = s.slice(0, start).trim();
    else s = (s.slice(0, start) + " " + s.slice(end + 1)).trim();
  }
  return s.trim();
}

export function validateGcodeLine(raw: string): { ok: true } | { ok: false; message: string } {
  const line = stripComments(raw);
  if (!line) return { ok: true };
  const upper = line.toUpperCase();
  if (upper.startsWith("%")) return { ok: true };

  const tokens = line.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length < 2) return { ok: false, message: `Invalid token: "${t}"` };
    const letter = t[0];
    if (!/[A-Za-z]/.test(letter)) return { ok: false, message: `Bad address: "${t}"` };
    const rest = t.slice(1);
    if (!/^[-+]?\d*\.?\d+$/.test(rest)) return { ok: false, message: `Bad number in "${t}"` };
  }
  return { ok: true };
}

export type ParsedCoords = { x?: number; y?: number; z?: number; f?: number };

export function parseCoordsFromLine(raw: string): ParsedCoords {
  const line = stripComments(raw).toUpperCase();
  const out: ParsedCoords = {};
  const re = /([XYZFS])\s*([-+]?\d*\.?\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const v = parseFloat(m[2]);
    if (Number.isNaN(v)) continue;
    const k = m[1].toLowerCase() as keyof ParsedCoords;
    if (k === "x" || k === "y" || k === "z" || k === "f" || k === "s") (out as Record<string, number>)[k] = v;
  }
  return out;
}
