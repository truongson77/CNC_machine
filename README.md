# CNC Mach3 UI

Web-based CNC control UI with a Node.js backend and React frontend. Supports USB serial communication with MCU firmware via JSON protocol.

## Structure

- `client/` — React + Vite frontend
- `server/` — Express + WebSocket API, serial bridge
- `firmware/` — MCU firmware and protocol
- `docs/` — Hardware setup notes

## Quick start

```bash
npm install
npm run dev          # simulated / default
npm run dev:usb      # USB serial (set SERIAL_PORT if needed)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run server + client in development |
| `npm run dev:usb` | Server with USB serial (`SERIAL_PORT=auto`) |
| `npm run ports` | List available serial ports |
| `npm run build` | Build client and server |
| `npm run start` | Run production server |

## Environment (server)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3847` | HTTP server port |
| `SERIAL_PORT` | — | Serial device path or `auto` |
| `SERIAL_BAUD` | `115200` | Baud rate |
| `SERIAL_PROTOCOL` | `json` | Hardware protocol |

See [docs/MCU_USB_SETUP.md](docs/MCU_USB_SETUP.md) for USB setup.
