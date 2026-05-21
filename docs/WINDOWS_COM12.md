# Tutorial: Run `dev:usb` on **COM12** (Windows)

Your MCU is on **COM12**. The UI still runs in the browser; only the **Node server** opens that serial port.

```
Browser  →  ws://localhost:3847  →  Node server  →  COM12  →  MCU
```

---

## Before you start

1. Plug in the MCU with a **data** USB cable.
2. In **Device Manager** → **Ports (COM & LPT)** confirm the port is **COM12** (number can change if you use another USB socket).
3. **Close** Arduino Serial Monitor, PuTTY, or anything else using COM12 (only one program at a time).
4. From the project root, install dependencies once:

```bash
cd path\to\KL-Khang
npm install
```

5. Optional — list ports from Node (should show `COM12`):

```bash
npm run ports
```

---

## Method 1 — Easiest: built-in script for COM12

From the **project root** (`KL-Khang` folder):

```bash
npm run dev:com12
```

This starts:

- **Server** on COM12 @ 115200 (JSON protocol)
- **Client** at http://localhost:5173

**Success:** terminal shows something like:

```text
[hardware] USB linked: COM12 @ 115200 (json)
```

**UI:** open http://localhost:5173 — footer should mention **USB SERIAL (COM12)**.

---

## Method 2 — Set port yourself (any COM number)

### PowerShell (recommended)

```powershell
cd path\to\KL-Khang
$env:SERIAL_PORT = "COM12"
$env:SERIAL_BAUD = "115200"
npm run dev:usb
```

`dev:usb` uses **auto-detect** for the server child script. For a **fixed** port, run the full stack like this instead:

```powershell
$env:SERIAL_PORT = "COM12"
$env:SERIAL_BAUD = "115200"
npm run dev
```

(`npm run dev` runs server + client; `SERIAL_PORT` is read when the server starts.)

### Command Prompt (cmd)

```cmd
cd path\to\KL-Khang
set SERIAL_PORT=COM12
set SERIAL_BAUD=115200
npm run dev
```

### One-liner with cross-env (works in PowerShell, cmd, and Git Bash)

```bash
npx cross-env SERIAL_PORT=COM12 SERIAL_BAUD=115200 npm run dev
```

---

## Method 3 — Server only on COM12, UI separate

**Terminal 1 — server + COM12:**

```bash
npm run dev:com12 -w server
```

**Terminal 2 — UI:**

```bash
npm run dev -w client
```

---

## Different baud rate or GRBL

If firmware is not 115200, or the board runs **GRBL**:

```powershell
$env:SERIAL_PORT = "COM12"
$env:SERIAL_BAUD = "115200"
$env:SERIAL_PROTOCOL = "grbl"
npm run dev
```

---

## Quick test after connect

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open http://localhost:5173 | Page loads |
| 2 | Check server terminal | `[hardware] USB linked: COM12 ...` |
| 3 | **Controller** → jog **X+** | DRO X changes (MCU must send status) |
| 4 | **MDI** → `G00 X5` → SEND | History shows SUCCESS (with JSON firmware) |

---

## Troubleshooting COM12

| Symptom | What to do |
|---------|------------|
| Port not COM12 anymore | Device Manager → note new COMx → use that in `SERIAL_PORT` |
| `USB open failed` / Access denied | Close Serial Monitor / other tools using COM12 |
| `Simulation mode` in log | `SERIAL_PORT` was not set — use Method 1 or 2 |
| `npm run dev:usb` ignores COM12 | `dev:usb` uses **auto**, not COM12 — use **`npm run dev:com12`** or set `SERIAL_PORT=COM12` |
| UI works, no motion | Flash `firmware/mcu_json_protocol` or match `SERIAL_PROTOCOL` to firmware |
| Wrong device on auto | Always set **`SERIAL_PORT=COM12`** explicitly |

---

## Change COM12 to another port later

Edit `server/package.json` script `dev:com12` or always use:

```powershell
$env:SERIAL_PORT = "COM5"
npm run dev
```

---

## Related docs

- Full USB + protocol: [MCU_USB_SETUP.md](MCU_USB_SETUP.md)
- Project overview: [../README.md](../README.md)
