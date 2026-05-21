/** JSON line protocol between Node host and MCU (one JSON object per line, newline-terminated). */

export type HostCommand =
  | { cmd: "ping" }
  | { cmd: "jog"; axis: "X" | "Y" | "Z"; dir: 1 | -1; step: number; rapid: boolean }
  | { cmd: "gcode"; line: string; id?: string }
  | { cmd: "estop" }
  | { cmd: "reset" }
  | { cmd: "feed_hold" }
  | { cmd: "cycle_start" }
  | { cmd: "home" }
  | { cmd: "feed_override"; delta: number }
  | { cmd: "spindle_override"; delta: number };

export type McuStatusEvent = {
  evt: "status";
  machine?: string;
  x?: number;
  y?: number;
  z?: number;
  spindle?: number;
  tempC?: number;
};

export type McuHelloEvent = {
  evt: "hello";
  firmware?: string;
  board?: string;
};

export type McuMdiDoneEvent = {
  evt: "mdi_done";
  id?: string;
  status: "SUCCESS" | "ERR_LIMIT" | "ERR_PARSE" | "EXECUTING";
  detail?: string;
  x?: number;
  y?: number;
  z?: number;
};

export type McuErrorEvent = {
  evt: "error";
  msg: string;
};

export type McuInbound = McuStatusEvent | McuHelloEvent | McuMdiDoneEvent | McuErrorEvent;

export function encodeHostCommand(cmd: HostCommand): string {
  return JSON.stringify(cmd) + "\n";
}

export function parseMcuLine(line: string): McuInbound | null {
  const s = line.trim();
  if (!s || s.startsWith("//")) return null;
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    if (typeof o.evt !== "string") return null;
    return o as McuInbound;
  } catch {
    return null;
  }
}

/** Map UI WebSocket command → serial protocol (when using JSON mode). */
export function wsToHostCommand(
  type: string,
  payload: Record<string, unknown>,
): HostCommand | null {
  switch (type) {
    case "jog":
      return {
        cmd: "jog",
        axis: (payload.axis as "X" | "Y" | "Z") ?? "X",
        dir: (payload.direction === -1 ? -1 : 1) as 1 | -1,
        step: Number(payload.stepMm) || 0.01,
        rapid: Boolean(payload.rapid),
      };
    case "mdi":
      return { cmd: "gcode", line: String(payload.line ?? ""), id: String(payload.id ?? "") };
    case "estop":
      return { cmd: "estop" };
    case "reset":
      return { cmd: "reset" };
    case "feed_hold":
      return { cmd: "feed_hold" };
    case "cycle_start":
      return { cmd: "cycle_start" };
    case "force_homing":
      return { cmd: "home" };
    case "feed_override":
      return { cmd: "feed_override", delta: Number(payload.delta) || 0 };
    case "spindle_override":
      return { cmd: "spindle_override", delta: Number(payload.delta) || 0 };
    default:
      return null;
  }
}
