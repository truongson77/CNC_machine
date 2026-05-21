# Connect MCU over USB (Type-C)

USB Type-C on most dev boards is a **USB serial (CDC)** port, not a special protocol. The PC runs the Node server; the server talks to the MCU over serial; the browser still uses **WebSocket** to the server.

```
Browser (UI)  ←WebSocket→  Node server  ←USB serial→  MCU firmware
```

## 1. Hardware wiring

1. Plug the board into the PC with a **data-capable** USB-C cable (charge-only cables will not work).
2. Install the board USB driver if needed (CP210x, CH340, native CDC).
3. Confirm the port appears:

```bash
npm run ports
```

Example macOS paths:

- `/dev/cu.usbmodem14101`
- `/dev/cu.usbserial-*`

Windows: `COM3`, `COM12`, …

**Windows tutorial for a fixed port (e.g. COM12):** see **[WINDOWS_COM12.md](WINDOWS_COM12.md)**.

## 2. Flash MCU firmware

### Option A — Custom JSON protocol (recommended for your UI)

1. Open `firmware/mcu_json_protocol/mcu_json_protocol.ino` in Arduino IDE.
2. Install **ArduinoJson** library (v6+).
3. Select your board (e.g. ESP32-S3 Dev Module) and the correct **USB CDC** port.
4. Upload.
5. Open Serial Monitor @ **115200** — you should see `{"evt":"hello",...}` lines.

### Option B — GRBL firmware

If the board already runs **GRBL** (common on GRBL shields):

```bash
SERIAL_PORT=/dev/cu.usbmodem14101 SERIAL_PROTOCOL=grbl npm run dev:usb -w server
```

The server sends G-code / `?` status polls instead of JSON.

## 3. Run the host with USB enabled

**Windows COM12 (recommended if Device Manager shows COM12):**

```bash
npm run dev:com12
```

**Auto-detect port (macOS / Linux / Windows):**

```bash
npm run dev:usb
```

**Explicit port**

| OS | Command |
|----|---------|
| Windows (PowerShell) | `$env:SERIAL_PORT="COM12"; npm run dev` |
| Windows (cmd) | `set SERIAL_PORT=COM12 && npm run dev` |
| macOS / Linux | `SERIAL_PORT=/dev/cu.usbmodem14101 npm run dev` |
| Any (cross-platform) | `npx cross-env SERIAL_PORT=COM12 npm run dev` |

Open http://localhost:5173 — footer should show **USB SERIAL (COM12)** (or your port) when linked.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERIAL_PORT` | *(unset = simulation)* | Port path, or `auto` |
| `SERIAL_BAUD` | `115200` | Must match firmware |
| `SERIAL_PROTOCOL` | `json` | `json` or `grbl` |

## 4. Test checklist

| UI action | MCU receives (JSON mode) | MCU should send |
|-----------|--------------------------|-----------------|
| Jog X+ | `{"cmd":"jog","axis":"X","dir":1,...}` | `status` with updated `x` |
| MDI `G00 X10` | `{"cmd":"gcode","line":"G00 X10","id":"..."}` | `mdi_done` + `status` |
| E-STOP | `{"cmd":"estop"}` | `machine":"ESTOP"` |
| RESET | `{"cmd":"reset"}` | `machine":"IDLE"` |
| Homing | `{"cmd":"home"}` | position near 0 |

Watch traffic:

```bash
# Terminal: server logs [hardware] USB linked: ...
# Browser DevTools → Network → WS → still shows state updates from MCU telemetry
```

## 5. Protocol reference (JSON)

**Host → MCU** (one JSON object per line):

```json
{"cmd":"ping"}
{"cmd":"jog","axis":"X","dir":1,"step":0.01,"rapid":false}
{"cmd":"gcode","line":"G01 X10 Y0 F500","id":"uuid"}
{"cmd":"estop"}
{"cmd":"reset"}
{"cmd":"home"}
```

**MCU → Host:**

```json
{"evt":"hello","firmware":"1.0","board":"ESP32"}
{"evt":"status","machine":"IDLE","x":10.5,"y":-2,"z":0,"spindle":1200}
{"evt":"mdi_done","id":"uuid","status":"SUCCESS","x":10,"y":0,"z":0}
{"evt":"error","msg":"reason"}
```

## 6. Troubleshooting

| Problem | Fix |
|---------|-----|
| Port not listed | Try another cable/port; install USB driver |
| `USB open failed` | Close Arduino Serial Monitor (only one app per port) |
| UI still simulates | `SERIAL_PORT` not set when server started |
| Garbled text | Baud mismatch — set both sides to 115200 |
| Works in monitor, not UI | Ensure server restarted with `SERIAL_PORT` |

## 7. What stays on the PC only

These are still handled in the **host** (not forwarded to MCU) unless you extend firmware:

- Work offset table (G54–G59) editing
- Params screen save (config JSON)
- G-code file preview during cycle (unless MCU runs the program)

Motion-critical commands (**jog, MDI, estop, reset, homing**) are forwarded when USB is connected.
