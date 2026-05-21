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
  limits: { xMin: number; xMax: number; yMin: number; yMax: number };
  homing: { homeX: number; homeY: number; speedMmMin: number; seekDistance: number };
  spindle: {
    pwmHz: number;
    pulleyRatio: number;
    coolantDelayS: number;
    mist: "OFF" | "ON";
    flood: "OFF" | "READY" | "ON";
  };
  mdiHistory: MdiHistoryEntry[];
  gcode: { filename: string; lines: string[]; currentLineIndex: number };
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
