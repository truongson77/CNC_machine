import { EventEmitter } from "node:events";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import type { HostCommand, McuInbound } from "./protocol.js";
import { encodeHostCommand, parseMcuLine } from "./protocol.js";

export type SerialBridgeEvents = {
  message: [McuInbound];
  raw: [string];
  open: [];
  close: [];
  error: [Error];
};

const SERIAL_DEBUG = process.env.SERIAL_DEBUG === "1" || process.env.SERIAL_DEBUG === "true";

export class SerialBridge extends EventEmitter<SerialBridgeEvents> {
  readonly path: string;
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private open = false;

  constructor(path: string, baudRate: number) {
    super();
    this.path = path;
    this.port = new SerialPort({ path, baudRate, autoOpen: false });
    this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));
    this.parser.on("data", (line: string) => {
      if (SERIAL_DEBUG) console.log(`[serial RX] ${line.trim()}`);
      const msg = parseMcuLine(line);
      if (msg) this.emit("message", msg);
      else this.emit("raw", line);
    });
    this.port.on("open", () => {
      this.open = true;
      this.emit("open");
    });
    this.port.on("close", () => {
      this.open = false;
      this.emit("close");
    });
    this.port.on("error", (err) => this.emit("error", err));
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.port) return reject(new Error("Port not initialized"));
      this.port.open((err) => (err ? reject(err) : resolve()));
    });
    this.send({ cmd: "ping" });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.port?.isOpen) {
        resolve();
        return;
      }
      this.port.close(() => resolve());
    });
  }

  isOpen() {
    return this.open;
  }

  send(cmd: HostCommand) {
    if (!this.port?.isOpen) {
      throw new Error(`Serial port ${this.path} is not open`);
    }
    const out = encodeHostCommand(cmd);
    if (SERIAL_DEBUG) console.log(`[serial TX] ${out.trim()}`);
    this.port.write(out);
  }

  /** Plain G-code line (GRBL-style firmware). */
  sendRawLine(line: string) {
    if (!this.port?.isOpen) throw new Error(`Serial port ${this.path} is not open`);
    this.port.write(line.trim() + "\n");
  }
}

export async function listSerialPorts(): Promise<
  { path: string; manufacturer?: string; vendorId?: string; productId?: string }[]
> {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer,
    vendorId: p.vendorId,
    productId: p.productId,
  }));
}

/** Pick first USB CDC/UART style port (macOS / Linux / Windows). */
export async function autoDetectPort(): Promise<string | null> {
  const ports = await SerialPort.list();
  const preferred = ports.find(
    (p) =>
      /usb|acm|uart|serial|cu\.|ttyUSB|ttyACM|COM/i.test(p.path) ||
      p.vendorId != null,
  );
  return preferred?.path ?? ports[0]?.path ?? null;
}
