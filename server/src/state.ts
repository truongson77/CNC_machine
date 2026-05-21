import { randomUUID } from "node:crypto";
import {
  parseCoordsFromLine,
  validateGcodeLine,
  type ParsedCoords,
} from "./gcode.js";

export type MachineStatus =
  | "IDLE"
  | "READY"
  | "STANDBY"
  | "EXECUTING"
  | "PAUSED"
  | "ERROR"
  | "ESTOP";

export type MdiEntryStatus =
  | "SUCCESS"
  | "EXECUTING"
  | "ERR_LIMIT"
  | "ERR_PARSE"
  | "OK";

export interface MdiHistoryEntry {
  id: string;
  ts: string;
  line: string;
  status: MdiEntryStatus;
  detail?: string;
}

export interface AxisMotorConfig {
  stepsPerMm: number;
  velocityMmMin: number;
  accelMmS2: number;
}

export interface MachineState {
  machineStatus: MachineStatus;
  statusLabel: string;
  mdiModeLabel: string;
  operator: { id: string; axisLocked: boolean };
  position: { x: number; y: number; z: number };
  machinePosition: { x: number; y: number; z: number };
  spindleRpm: number;
  spindleCommandRpm: number;
  feedOverridePercent: number;
  spindleOverridePercent: number;
  activeWorkOffset: string;
  workOffsets: Record<string, { x: number; y: number; z: number }>;
  unitMm: boolean;
  axisMotor: { x: AxisMotorConfig; y: AxisMotorConfig };
  invertX: boolean;
  invertY: boolean;
  softLimits: boolean;
  autoZeroHome: boolean;
  limits: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  homing: { homeX: number; homeY: number; speedMmMin: number; seekDistance: number };
  spindle: {
    pwmHz: number;
    pulleyRatio: number;
    coolantDelayS: number;
    mist: "OFF" | "ON";
    flood: "OFF" | "READY" | "ON";
  };
  mdiHistory: MdiHistoryEntry[];
  gcode: {
    filename: string;
    lines: string[];
    currentLineIndex: number;
  };
  diagnostics: {
    terminalConnected: boolean;
    bufferClear: boolean;
    cpuPercent: number;
    memUsedGb: number;
    memTotalGb: number;
    bufferPercent: number;
    networkConnected: boolean;
    firmware: string;
    appVersion: string;
    ethernet: string;
    uptimeSec: number;
    tempC: number;
    feedPercentFooter: number;
    spindleRpmFooter: number;
    latencyMs: number;
  };
  travelPercent: { x: number; y: number };
  systemToast: string;
}

const DEMO_GCODE = `N440 G01 X120.000 Y-40.000 F1200
N441 G01 X122.000 Y-41.000 F1200
N442 G01 X124.508 Y-42.012 F1200
N443 G01 X126.442 Y-40.220 F1200
N444 G01 X128.000 Y-38.000 F1200
N445 G00 X130.000 Y-35.000
N446 G01 X132.000 Y-32.000 F800`.split("\n");

function nowIso() {
  return new Date().toISOString().slice(11, 19);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export class MachineRuntime {
  state: MachineState;
  private wsBroadcast: (msg: object) => void;
  private mdiTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();
  private targetDuringCycle: ParsedCoords | null = null;
  private hardwareMode = false;
  private hardwareForward: ((type: string, payload: Record<string, unknown>) => boolean) | null =
    null;

  constructor(wsBroadcast: (msg: object) => void) {
    this.wsBroadcast = wsBroadcast;
    this.state = this.initialState();
  }

  isHardwareMode() {
    return this.hardwareMode;
  }

  setHardwareForward(
    fn: ((type: string, payload: Record<string, unknown>) => boolean) | null,
  ) {
    this.hardwareForward = fn;
  }

  enableHardwareMode(on: boolean, portLabel: string) {
    this.hardwareMode = on;
    this.state.diagnostics.terminalConnected = on;
    this.state.diagnostics.networkConnected = on;
    this.state.diagnostics.ethernet = on ? `USB SERIAL (${portLabel})` : "DISCONNECTED";
    if (on) {
      this.state.systemToast = `Hardware linked: ${portLabel}`;
      if (this.cycleTimer) clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.emit();
  }

  setHardwareLink(linked: boolean) {
    this.state.diagnostics.bufferClear = linked;
    this.emit();
  }

  setFirmwareLabel(fw: string) {
    this.state.diagnostics.firmware = fw;
    this.emit();
  }

  setSystemToast(msg: string) {
    this.state.systemToast = msg;
    this.emit();
  }

  applyHardwareTelemetry(patch: {
    machineStatus?: MachineStatus;
    x?: number;
    y?: number;
    z?: number;
    spindle?: number;
    tempC?: number;
  }) {
    if (patch.machineStatus) {
      this.state.machineStatus = patch.machineStatus;
      this.state.statusLabel =
        patch.machineStatus === "EXECUTING"
          ? "STATUS: RUNNING"
          : patch.machineStatus === "ESTOP"
            ? "STATUS: E-STOP"
            : patch.machineStatus === "PAUSED"
              ? "STATUS: HOLD"
              : patch.machineStatus === "ERROR"
                ? "STATUS: ERROR"
                : "STATUS: READY";
    }
    if (patch.x != null) this.state.position.x = patch.x;
    if (patch.y != null) this.state.position.y = patch.y;
    if (patch.z != null) this.state.position.z = patch.z;
    if (patch.spindle != null) this.state.spindleRpm = patch.spindle;
    if (patch.tempC != null) this.state.diagnostics.tempC = patch.tempC;
    this.syncMachineFromWork();
    this.updateTravelPercent();
    this.emit();
  }

  applyHardwareEstop() {
    for (const t of this.mdiTimers.values()) clearTimeout(t);
    this.mdiTimers.clear();
    this.state.machineStatus = "ESTOP";
    this.state.statusLabel = "STATUS: E-STOP";
    this.state.spindleRpm = 0;
    this.state.systemToast = "EMERGENCY STOP (MCU)";
    this.emit();
  }

  applyHardwareReset() {
    for (const t of this.mdiTimers.values()) clearTimeout(t);
    this.mdiTimers.clear();
    this.state.machineStatus = "READY";
    this.state.statusLabel = "STATUS: READY";
    this.state.systemToast = "Reset (MCU)";
    this.emit();
  }

  /** Validate MDI and queue history; returns id sent to MCU or null if validation failed. */
  prepareMdiForHardware(raw: string): string | null {
    const line = raw.trim();
    if (!line) return null;
    if (this.state.machineStatus === "ESTOP") return null;
    const v = validateGcodeLine(line);
    if (!v.ok) {
      const id = randomUUID();
      this.state.mdiHistory.unshift({
        id,
        ts: nowIso(),
        line,
        status: "ERR_PARSE",
        detail: v.message,
      });
      this.emit();
      return null;
    }
    const id = randomUUID();
    this.state.mdiHistory.unshift({
      id,
      ts: nowIso(),
      line,
      status: "EXECUTING",
    });
    this.state.machineStatus = "EXECUTING";
    this.state.statusLabel = "STATUS: RUNNING";
    this.state.systemToast = "MDI sent to MCU…";
    this.emit();
    return id;
  }

  completeMdiFromHardware(result: {
    id?: string;
    status: MdiEntryStatus;
    detail?: string;
    x?: number;
    y?: number;
    z?: number;
  }) {
    const entry = result.id
      ? this.state.mdiHistory.find((h) => h.id === result.id)
      : this.state.mdiHistory.find((h) => h.status === "EXECUTING");
    if (entry) {
      entry.status = result.status;
      entry.detail = result.detail;
    }
    if (result.x != null) this.state.position.x = result.x;
    if (result.y != null) this.state.position.y = result.y;
    if (result.z != null) this.state.position.z = result.z;
    this.syncMachineFromWork();
    if (result.status === "SUCCESS") {
      this.state.machineStatus = "IDLE";
      this.state.statusLabel = "STATUS: READY";
      this.state.systemToast = "MDI complete (MCU)";
    } else if (result.status === "ERR_LIMIT") {
      this.state.machineStatus = "ERROR";
      this.state.statusLabel = "STATUS: ERROR";
      this.state.systemToast = result.detail ?? "Limit fault (MCU)";
    }
    this.updateTravelPercent();
    this.emit();
  }

  private tryForward(type: string, payload: Record<string, unknown>): boolean {
    if (!this.hardwareMode || !this.hardwareForward) return false;
    return this.hardwareForward(type, payload);
  }

  private initialState(): MachineState {
    return {
      machineStatus: "IDLE",
      statusLabel: "STATUS: READY",
      mdiModeLabel: "MDI MODE",
      operator: { id: "OPERATOR_01", axisLocked: true },
      position: { x: 124.508, y: -42.012, z: 0 },
      machinePosition: { x: 244.102, y: -12.884, z: 50 },
      spindleRpm: 1200,
      spindleCommandRpm: 4500,
      feedOverridePercent: 120,
      spindleOverridePercent: 100,
      activeWorkOffset: "G54",
      workOffsets: {
        G54: { x: 0, y: 0, z: -120.45 },
        G55: { x: 125, y: 200, z: 0 },
        G56: { x: 0, y: 0, z: 0 },
        G57: { x: 0, y: 0, z: 0 },
        G58: { x: 0, y: 0, z: 0 },
        G59: { x: 10, y: 10, z: 10 },
      },
      unitMm: true,
      axisMotor: {
        x: { stepsPerMm: 400, velocityMmMin: 3000, accelMmS2: 250 },
        y: { stepsPerMm: 400, velocityMmMin: 3000, accelMmS2: 250 },
      },
      invertX: false,
      invertY: true,
      softLimits: true,
      autoZeroHome: true,
      limits: { xMin: 0, xMax: 200, yMin: -60, yMax: 60 },
      homing: { homeX: 0, homeY: 0, speedMmMin: 500, seekDistance: 10 },
      spindle: {
        pwmHz: 5000,
        pulleyRatio: 1,
        coolantDelayS: 2.5,
        mist: "OFF",
        flood: "READY",
      },
      mdiHistory: [
        {
          id: randomUUID(),
          ts: "14:22:01",
          line: "G54",
          status: "OK",
        },
        {
          id: randomUUID(),
          ts: "14:22:15",
          line: "M03 S2500",
          status: "SUCCESS",
        },
        {
          id: randomUUID(),
          ts: "14:23:40",
          line: "G01 X150.5 Y-22.1 F5000",
          status: "ERR_LIMIT",
          detail: "LIMIT REACHED",
        },
      ],
      gcode: {
        filename: "BRACKET_V2.NC",
        lines: DEMO_GCODE,
        currentLineIndex: 2,
      },
      diagnostics: {
        terminalConnected: true,
        bufferClear: true,
        cpuPercent: 12,
        memUsedGb: 1.4,
        memTotalGb: 8,
        bufferPercent: 98,
        networkConnected: true,
        firmware: "v2.4.1-STABLE",
        appVersion: "V4.8.2-STABLE",
        ethernet: "CONNECTED (10.0.0.42)",
        uptimeSec: 4 * 3600 + 12 * 60 + 44,
        tempC: 32,
        feedPercentFooter: 100,
        spindleRpmFooter: 2500,
        latencyMs: 4,
      },
      travelPercent: { x: 42, y: 18 },
      systemToast: "SYSTEM READY - Awaiting operator input",
    };
  }

  snapshot() {
    return structuredClone(this.state);
  }

  private emit() {
    this.wsBroadcast({ type: "state", payload: this.snapshot() });
  }

  private softLimitCheck(coords: ParsedCoords): boolean {
    if (!this.state.softLimits) return true;
    const { x, y } = this.state.position;
    const nx = coords.x ?? x;
    const ny = coords.y ?? y;
    const { limits } = this.state;
    return nx >= limits.xMin && nx <= limits.xMax && ny >= limits.yMin && ny <= limits.yMax;
  }

  tickDiagnostics() {
    const d = this.state.diagnostics;
    d.cpuPercent = clamp(8 + Math.sin(Date.now() / 2000) * 6, 5, 22);
    d.latencyMs = Math.round(3 + Math.random() * 4);
    d.uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
  }

  submitMdi(raw: string) {
    const line = raw.trim();
    if (!line) return { ok: false as const, error: "Empty line" };
    if (this.state.machineStatus === "ESTOP") {
      return { ok: false as const, error: "Machine in E-STOP" };
    }
    if (this.tryForward("mdi", { line })) {
      return { ok: true as const };
    }

    const v = validateGcodeLine(line);
    if (!v.ok) {
      const id = randomUUID();
      this.state.mdiHistory.unshift({
        id,
        ts: nowIso(),
        line,
        status: "ERR_PARSE",
        detail: v.message,
      });
      this.emit();
      return { ok: false as const, error: v.message };
    }

    const coords = parseCoordsFromLine(line);
    const id = randomUUID();
    const entry: MdiHistoryEntry = {
      id,
      ts: nowIso(),
      line,
      status: "EXECUTING",
    };
    this.state.mdiHistory.unshift(entry);
    this.state.machineStatus = "EXECUTING";
    this.state.statusLabel = "STATUS: RUNNING";
    this.state.systemToast = "Executing MDI…";
    this.emit();

    const limitOk = this.softLimitCheck(coords);
    const delay = 400 + Math.random() * 500;

    const t = setTimeout(() => {
      this.mdiTimers.delete(id);
      const e = this.state.mdiHistory.find((h) => h.id === id);
      if (!e) return;
      if (!limitOk) {
        e.status = "ERR_LIMIT";
        e.detail = "LIMIT REACHED";
        this.state.machineStatus = "ERROR";
        this.state.statusLabel = "STATUS: ERROR";
        this.state.systemToast = "Limit or fault — reset required";
      } else {
        e.status = "SUCCESS";
        if (coords.x != null) this.state.position.x = coords.x;
        if (coords.y != null) this.state.position.y = coords.y;
        if (coords.z != null) this.state.position.z = coords.z;
        this.syncMachineFromWork();
        this.state.machineStatus = "IDLE";
        this.state.statusLabel = "STATUS: READY";
        this.state.systemToast = "SYSTEM READY - Awaiting operator input";
      }
      this.updateTravelPercent();
      this.emit();
    }, delay);
    this.mdiTimers.set(id, t);
    return { ok: true as const };
  }

  jog(axis: "X" | "Y" | "Z", direction: 1 | -1, rapid: boolean, stepMm: number) {
    if (this.state.machineStatus === "ESTOP" || this.state.machineStatus === "ERROR") return;
    if (this.tryForward("jog", { axis, direction, rapid, stepMm })) return;
    const dist = rapid ? stepMm * 50 : stepMm;
    const sign = direction;
    const p = this.state.position;
    const c: ParsedCoords = {};
    if (axis === "X") c.x = p.x + sign * dist;
    if (axis === "Y") c.y = p.y + sign * dist;
    if (axis === "Z") c.z = p.z + sign * dist;
    if (!this.softLimitCheck(c)) {
      this.state.systemToast = "Jog blocked — soft limit";
      this.emit();
      return;
    }
    if (c.x != null) p.x = c.x;
    if (c.y != null) p.y = c.y;
    if (c.z != null) p.z = c.z;
    this.syncMachineFromWork();
    this.updateTravelPercent();
    this.emit();
  }

  cycleStart() {
    if (this.state.machineStatus === "ESTOP") return;
    if (this.tryForward("cycle_start", {})) return;
    if (this.state.machineStatus === "PAUSED") {
      this.state.machineStatus = "EXECUTING";
      this.state.statusLabel = "STATUS: RUNNING";
      this.startCycleTimer();
      this.emit();
      return;
    }
    if (this.cycleTimer) return;
    this.state.machineStatus = "EXECUTING";
    this.state.statusLabel = "STATUS: RUNNING";
    this.state.systemToast = "Cycle running";
    this.startCycleTimer();
    this.emit();
  }

  feedHold() {
    if (this.tryForward("feed_hold", {})) return;
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    if (this.state.machineStatus === "EXECUTING") {
      this.state.machineStatus = "PAUSED";
      this.state.statusLabel = "STATUS: HOLD";
      this.state.systemToast = "Feed hold";
    }
    this.emit();
  }

  reset() {
    if (this.tryForward("reset", {})) return;
    for (const t of this.mdiTimers.values()) clearTimeout(t);
    this.mdiTimers.clear();
    if (this.cycleTimer) clearInterval(this.cycleTimer);
    this.cycleTimer = null;
    this.state.machineStatus = "READY";
    this.state.statusLabel = "STATUS: READY";
    this.state.systemToast = "Reset complete";
    this.emit();
  }

  emergencyStop() {
    if (this.tryForward("estop", {})) return;
    for (const t of this.mdiTimers.values()) clearTimeout(t);
    this.mdiTimers.clear();
    if (this.cycleTimer) clearInterval(this.cycleTimer);
    this.cycleTimer = null;
    this.state.machineStatus = "ESTOP";
    this.state.statusLabel = "STATUS: E-STOP";
    this.state.spindleRpm = 0;
    this.state.systemToast = "EMERGENCY STOP — cycle aborted";
    this.emit();
  }

  setFeedOverride(delta: number) {
    if (this.tryForward("feed_override", { delta })) return;
    this.state.feedOverridePercent = clamp(this.state.feedOverridePercent + delta, 0, 200);
    this.state.diagnostics.feedPercentFooter = clamp(
      this.state.diagnostics.feedPercentFooter + delta,
      0,
      200,
    );
    this.emit();
  }

  setSpindleOverride(delta: number) {
    if (this.tryForward("spindle_override", { delta })) return;
    this.state.spindleOverridePercent = clamp(this.state.spindleOverridePercent + delta, 0, 200);
    this.emit();
  }

  selectWorkOffset(code: string) {
    if (this.state.workOffsets[code]) {
      this.state.activeWorkOffset = code;
      this.syncWorkPositionFromMachine();
      this.emit();
    }
  }

  zeroAxis(which: "X" | "Y" | "Z" | "ALL") {
    const wo = this.state.workOffsets[this.state.activeWorkOffset];
    if (!wo) return;
    const mp = this.state.machinePosition;
    if (which === "ALL" || which === "X") wo.x = mp.x;
    if (which === "ALL" || which === "Y") wo.y = mp.y;
    if (which === "ALL" || which === "Z") wo.z = mp.z;
    this.syncWorkPositionFromMachine();
    this.emit();
  }

  applyManualOffset(axis: "X" | "Y" | "Z", delta: number) {
    const wo = this.state.workOffsets[this.state.activeWorkOffset];
    if (!wo) return;
    if (axis === "X") wo.x += delta;
    if (axis === "Y") wo.y += delta;
    if (axis === "Z") wo.z += delta;
    this.syncWorkPositionFromMachine();
    this.emit();
  }

  updateAxisConfig(patch: {
    axisMotor?: Partial<{ x: Partial<AxisMotorConfig>; y: Partial<AxisMotorConfig> }>;
    invertX?: boolean;
    invertY?: boolean;
    softLimits?: boolean;
    autoZeroHome?: boolean;
    limits?: Partial<MachineState["limits"]>;
    homing?: Partial<MachineState["homing"]>;
    spindle?: Partial<MachineState["spindle"]>;
  }) {
    if (patch.axisMotor?.x) Object.assign(this.state.axisMotor.x, patch.axisMotor.x);
    if (patch.axisMotor?.y) Object.assign(this.state.axisMotor.y, patch.axisMotor.y);
    if (patch.invertX != null) this.state.invertX = patch.invertX;
    if (patch.invertY != null) this.state.invertY = patch.invertY;
    if (patch.softLimits != null) this.state.softLimits = patch.softLimits;
    if (patch.autoZeroHome != null) this.state.autoZeroHome = patch.autoZeroHome;
    if (patch.limits) Object.assign(this.state.limits, patch.limits);
    if (patch.homing) Object.assign(this.state.homing, patch.homing);
    if (patch.spindle) Object.assign(this.state.spindle, patch.spindle);
    this.emit();
  }

  forceHoming() {
    if (this.tryForward("force_homing", {})) return;
    this.state.position.x = this.state.homing.homeX;
    this.state.position.y = this.state.homing.homeY;
    this.syncMachineFromWork();
    this.state.systemToast = "Homing complete (simulated)";
    this.updateTravelPercent();
    this.emit();
  }

  testMotor(axis: "X" | "Y") {
    void axis;
    this.state.systemToast = `Test pulse sent — ${axis} (simulated)`;
    this.emit();
  }

  setUnitMm(mm: boolean) {
    this.state.unitMm = mm;
    this.emit();
  }

  private syncMachineFromWork() {
    const wo = this.state.workOffsets[this.state.activeWorkOffset];
    if (!wo) return;
    this.state.machinePosition = {
      x: this.state.position.x + wo.x,
      y: this.state.position.y + wo.y,
      z: this.state.position.z + wo.z,
    };
  }

  private syncWorkPositionFromMachine() {
    const wo = this.state.workOffsets[this.state.activeWorkOffset];
    if (!wo) return;
    const mp = this.state.machinePosition;
    this.state.position = {
      x: mp.x - wo.x,
      y: mp.y - wo.y,
      z: mp.z - wo.z,
    };
  }

  private updateTravelPercent() {
    const { x, y } = this.state.position;
    const { limits } = this.state;
    this.state.travelPercent.x = Math.round(
      clamp(((x - limits.xMin) / (limits.xMax - limits.xMin || 1)) * 100, 0, 100),
    );
    this.state.travelPercent.y = Math.round(
      clamp(((y - limits.yMin) / (limits.yMax - limits.yMin || 1)) * 100, 0, 100),
    );
  }

  private startCycleTimer() {
    if (this.cycleTimer) clearInterval(this.cycleTimer);
    this.cycleTimer = setInterval(() => {
      const { lines, currentLineIndex } = this.state.gcode;
      if (!lines.length) return;
      const line = lines[currentLineIndex];
      const coords = parseCoordsFromLine(line);
      this.targetDuringCycle = coords;

      const p = this.state.position;
      const tx = coords.x ?? p.x;
      const ty = coords.y ?? p.y;
      const tz = coords.z ?? p.z;
      const step = 0.8;
      const nx = p.x + Math.sign(tx - p.x) * Math.min(step, Math.abs(tx - p.x));
      const ny = p.y + Math.sign(ty - p.y) * Math.min(step, Math.abs(ty - p.y));
      const nz = p.z + Math.sign(tz - p.z) * Math.min(step, Math.abs(tz - p.z));
      this.state.position = { x: nx, y: ny, z: nz };
      this.syncMachineFromWork();

      const atTarget =
        Math.abs(nx - tx) < 0.01 && Math.abs(ny - ty) < 0.01 && Math.abs(nz - tz) < 0.01;
      if (atTarget) {
        if (currentLineIndex < lines.length - 1) {
          this.state.gcode.currentLineIndex = currentLineIndex + 1;
        } else {
          clearInterval(this.cycleTimer!);
          this.cycleTimer = null;
          this.state.machineStatus = "STANDBY";
          this.state.statusLabel = "STATUS: STANDBY";
          this.state.systemToast = "Program end — standby";
        }
      }
      this.state.spindleRpm = clamp(
        this.state.spindleCommandRpm * (this.state.spindleOverridePercent / 100),
        0,
        24000,
      );
      this.updateTravelPercent();
      this.emit();
    }, 120);
  }
}
