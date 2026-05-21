import type { MachineRuntime } from "../state.js";
import type { MachineStatus } from "../state.js";
import { parseGrblStatus, grblStateToMachineStatus } from "./grblParser.js";
import type { McuInbound } from "./protocol.js";
import { wsToHostCommand } from "./protocol.js";
import { SerialBridge } from "./serialBridge.js";

export type HardwareProtocol = "json" | "grbl";

export type HardwareHandle = {
  bridge: SerialBridge;
  protocol: HardwareProtocol;
  /** Returns true if the WS command was forwarded to the MCU (skip simulation). */
  forward: (type: string, payload: Record<string, unknown>) => boolean;
  pollGrbl?: ReturnType<typeof setInterval>;
};

function mapMachineStatus(raw?: string): MachineStatus {
  const u = (raw ?? "IDLE").toUpperCase();
  if (u === "ESTOP" || u === "E-STOP") return "ESTOP";
  if (u === "EXECUTING" || u === "RUN") return "EXECUTING";
  if (u === "PAUSED" || u === "HOLD") return "PAUSED";
  if (u === "ERROR" || u === "ALARM") return "ERROR";
  if (u === "STANDBY") return "STANDBY";
  if (u === "READY") return "READY";
  return "IDLE";
}

export function bindSerialToMachine(
  machine: MachineRuntime,
  bridge: SerialBridge,
  protocol: HardwareProtocol,
): HardwareHandle {
  machine.enableHardwareMode(true, bridge.path);

  bridge.on("message", (msg) => ingestMcu(machine, msg, protocol));
  if (protocol === "grbl") {
    bridge.on("raw", (line) => ingestGrblLine(machine, line));
  }

  bridge.on("close", () => {
    machine.enableHardwareMode(false, "");
    machine.setHardwareLink(false);
  });

  bridge.on("error", (err) => {
    machine.setSystemToast(`Serial error: ${err.message}`);
  });

  const forward = (type: string, payload: Record<string, unknown>): boolean => {
    if (protocol === "json") {
      const cmd = wsToHostCommand(type, payload);
      if (!cmd) return false;
      if (type === "mdi") {
        const line = String(payload.line ?? "").trim();
        const id = machine.prepareMdiForHardware(line);
        if (!id) return true;
        bridge.send({ cmd: "gcode", line, id });
        return true;
      }
      bridge.send(cmd);
      if (type === "estop") machine.applyHardwareEstop();
      if (type === "reset") machine.applyHardwareReset();
      return true;
    }

    // GRBL: real-time commands + G-code lines
    if (type === "estop") {
      bridge.sendRawLine("!");
      machine.applyHardwareEstop();
      return true;
    }
    if (type === "feed_hold") {
      bridge.sendRawLine("!");
      return true;
    }
    if (type === "cycle_start") {
      bridge.sendRawLine("~");
      return true;
    }
    if (type === "reset") {
      bridge.sendRawLine("\x18"); // Ctrl-X soft reset
      machine.applyHardwareReset();
      return true;
    }
    if (type === "jog") {
      const axis = String(payload.axis ?? "X").toUpperCase();
      const dir = payload.direction === -1 ? -1 : 1;
      const step = Number(payload.stepMm) || 0.01;
      const dist = (payload.rapid ? step * 50 : step) * dir;
      const letter = axis === "Z" ? "Z" : axis === "Y" ? "Y" : "X";
      bridge.sendRawLine(`$J=G91 G21 ${letter}${dist.toFixed(3)} F500`);
      return true;
    }
    if (type === "mdi") {
      const line = String(payload.line ?? "").trim();
      const id = machine.prepareMdiForHardware(line);
      if (!id) return true;
      bridge.sendRawLine(line);
      return true;
    }
    if (type === "force_homing") {
      bridge.sendRawLine("$H");
      return true;
    }
    return false;
  };

  let pollGrbl: ReturnType<typeof setInterval> | undefined;
  if (protocol === "grbl") {
    pollGrbl = setInterval(() => {
      try {
        bridge.sendRawLine("?");
      } catch {
        /* port closed */
      }
    }, 250);
  }

  machine.setHardwareForward(forward);
  machine.setHardwareLink(true);
  return { bridge, protocol, forward, pollGrbl };
}

function ingestMcu(machine: MachineRuntime, msg: McuInbound, protocol: HardwareProtocol) {
  if (protocol === "grbl") return;

  if (msg.evt === "hello") {
    machine.setFirmwareLabel(msg.firmware ?? "MCU");
    machine.setSystemToast(`MCU connected: ${msg.board ?? msg.firmware ?? "device"}`);
    return;
  }
  if (msg.evt === "error") {
    machine.setSystemToast(msg.msg);
    return;
  }
  if (msg.evt === "status") {
    machine.applyHardwareTelemetry({
      machineStatus: mapMachineStatus(msg.machine),
      x: msg.x,
      y: msg.y,
      z: msg.z,
      spindle: msg.spindle,
      tempC: msg.tempC,
    });
    return;
  }
  if (msg.evt === "mdi_done") {
    machine.completeMdiFromHardware({
      id: msg.id,
      status: msg.status,
      detail: msg.detail,
      x: msg.x,
      y: msg.y,
      z: msg.z,
    });
  }
}

/** Parse GRBL text lines forwarded as raw serial data. */
export function ingestGrblLine(machine: MachineRuntime, line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (trimmed === "ok") return;
  if (trimmed.startsWith("error:")) {
    machine.setSystemToast(trimmed);
    return;
  }
  const report = parseGrblStatus(trimmed);
  if (!report) return;
  const status = grblStateToMachineStatus(report.state) as MachineStatus;
  machine.applyHardwareTelemetry({
    machineStatus: status,
    x: report.mpos?.x,
    y: report.mpos?.y,
    z: report.mpos?.z,
    spindle: report.spindle,
  });
}
