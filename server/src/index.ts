import http from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { MachineRuntime } from "./state.js";
import {
  SerialBridge,
  autoDetectPort,
  listSerialPorts,
} from "./hardware/serialBridge.js";
import { bindSerialToMachine, type HardwareProtocol } from "./hardware/bind.js";

const PORT = Number(process.env.PORT ?? 3847);
const SERIAL_PORT = process.env.SERIAL_PORT?.trim();
const SERIAL_BAUD = Number(process.env.SERIAL_BAUD ?? 115200);
const SERIAL_PROTOCOL = (process.env.SERIAL_PROTOCOL ?? "json").toLowerCase() as HardwareProtocol;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set<import("ws").WebSocket>();

function broadcast(msg: object) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

const machine = new MachineRuntime(broadcast);
let hardwareHandle: ReturnType<typeof bindSerialToMachine> | null = null;

async function initHardware() {
  if (!SERIAL_PORT) {
    console.log("[hardware] Simulation mode (set SERIAL_PORT to connect USB MCU)");
    return;
  }

  const path =
    SERIAL_PORT === "auto" ? await autoDetectPort() : SERIAL_PORT;
  if (!path) {
    console.error("[hardware] No serial port found. Run: npm run ports -w server");
    return;
  }

  const protocol: HardwareProtocol =
    SERIAL_PROTOCOL === "grbl" ? "grbl" : "json";
  const bridge = new SerialBridge(path, SERIAL_BAUD);

  try {
    await bridge.connect();
    hardwareHandle = bindSerialToMachine(machine, bridge, protocol);
    console.log(`[hardware] USB linked: ${path} @ ${SERIAL_BAUD} (${protocol})`);
  } catch (err) {
    console.error("[hardware] Failed to open serial port:", err);
    machine.setSystemToast(
      `USB open failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
}

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "state", payload: machine.snapshot() }));
  ws.on("message", (buf) => {
    let msg: unknown;
    try {
      msg = JSON.parse(String(buf));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;
    const m = msg as { type: string; payload?: unknown };
    handleClientMessage(ws, m.type, m.payload);
  });
  ws.on("close", () => clients.delete(ws));
});

function handleClientMessage(
  ws: import("ws").WebSocket,
  type: string,
  payload: unknown,
) {
  const p = (payload ?? {}) as Record<string, unknown>;
  try {
    switch (type) {
      case "mdi": {
        const line = String(p.line ?? "");
        const r = machine.submitMdi(line);
        if (!r.ok) ws.send(JSON.stringify({ type: "mdi_error", message: r.error }));
        break;
      }
      case "jog": {
        const axis = p.axis as "X" | "Y" | "Z";
        const direction = (p.direction === -1 ? -1 : 1) as 1 | -1;
        console.log(`[jog] ${axis} dir=${direction} hw=${machine.isHardwareMode()}`);
        machine.jog(axis, direction, Boolean(p.rapid), Number(p.stepMm) || 0.01);
        break;
      }
      case "cycle_start":
        machine.cycleStart();
        break;
      case "feed_hold":
        machine.feedHold();
        break;
      case "reset":
        machine.reset();
        break;
      case "estop":
        machine.emergencyStop();
        break;
      case "feed_override":
        machine.setFeedOverride(Number(p.delta) || 0);
        break;
      case "spindle_override":
        machine.setSpindleOverride(Number(p.delta) || 0);
        break;
      case "select_offset":
        machine.selectWorkOffset(String(p.code ?? "G54"));
        break;
      case "zero_axis":
        machine.zeroAxis((p.which as "X" | "Y" | "Z" | "ALL") ?? "ALL");
        break;
      case "apply_offset_delta":
        machine.applyManualOffset(
          (p.axis as "X" | "Y" | "Z") ?? "X",
          Number(p.delta) || 0,
        );
        break;
      case "set_unit_mm":
        machine.setUnitMm(Boolean(p.mm));
        break;
      case "config_patch":
        machine.updateAxisConfig(
          (p as {
            axisMotor?: { x?: object; y?: object };
            invertX?: boolean;
            invertY?: boolean;
            softLimits?: boolean;
            autoZeroHome?: boolean;
            limits?: object;
            homing?: object;
            spindle?: object;
          }) ?? {},
        );
        break;
      case "force_homing":
        machine.forceHoming();
        break;
      case "test_motor":
        machine.testMotor((p.axis as "X" | "Y") ?? "X");
        break;
      default:
        ws.send(JSON.stringify({ type: "error", message: `Unknown type: ${type}` }));
    }
  } catch (e) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: e instanceof Error ? e.message : "Command failed",
      }),
    );
  }
}

app.get("/api/state", (_req, res) => {
  res.json(machine.snapshot());
});

app.get("/api/ports", async (_req, res) => {
  res.json({ ports: await listSerialPorts(), hardware: machine.isHardwareMode() });
});

app.get("/api/hardware", (_req, res) => {
  const s = machine.snapshot();
  res.json({
    hardware: machine.isHardwareMode(),
    ethernet: s.diagnostics.ethernet,
    terminalConnected: s.diagnostics.terminalConnected,
    position: s.position,
  });
});

app.post("/api/mdi", (req, res) => {
  const line = String(req.body?.line ?? "");
  const r = machine.submitMdi(line);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});

app.post("/api/config", (req, res) => {
  machine.updateAxisConfig(req.body ?? {});
  res.json({ ok: true });
});

setInterval(() => {
  machine.tickDiagnostics();
  broadcast({ type: "state", payload: machine.snapshot() });
}, 1000);

server.listen(PORT, async () => {
  console.log(`CNC server listening on http://localhost:${PORT}`);
  await initHardware();
});

process.on("SIGINT", async () => {
  if (hardwareHandle?.pollGrbl) clearInterval(hardwareHandle.pollGrbl);
  await hardwareHandle?.bridge.disconnect();
  process.exit(0);
});
