/**
 * Minimal GRBL status report parser.
 * Example input: <Idle|MPos:10.000,-5.000,0.000|FS:0,1200>
 */

export type GrblReport = {
  state: string;
  mpos?: { x: number; y: number; z: number };
  spindle?: number;
};

export function parseGrblStatus(line: string): GrblReport | null {
  const s = line.trim();
  if (!s.startsWith("<") || !s.endsWith(">")) return null;
  const inner = s.slice(1, -1);
  const parts = inner.split("|");
  const out: GrblReport = { state: parts[0] ?? "Unknown" };
  for (const p of parts.slice(1)) {
    if (p.startsWith("MPos:")) {
      const [x, y, z] = p.slice(5).split(",").map(Number);
      if ([x, y, z].every((n) => Number.isFinite(n))) out.mpos = { x, y, z };
    }
    if (p.startsWith("FS:")) {
      const fs = p.slice(3).split(",");
      const spindle = Number(fs[1]);
      if (Number.isFinite(spindle)) out.spindle = spindle;
    }
  }
  return out;
}

export function grblStateToMachineStatus(state: string): string {
  const u = state.toUpperCase();
  if (u.includes("ALARM") || u.includes("HOLD")) return "ERROR";
  if (u.includes("RUN")) return "EXECUTING";
  if (u.includes("HOLD")) return "PAUSED";
  if (u.includes("IDLE")) return "IDLE";
  return "READY";
}
