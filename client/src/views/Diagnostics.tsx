import { useMachine } from "../machineContext";

function fmtUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function DiagnosticsView() {
  const { state, send } = useMachine();
  if (!state) return <div className="empty-state">Connecting…</div>;

  const d = state.diagnostics;

  return (
    <div className="grid-2">
      <div className="panel">
        <h2>SYSTEM HEALTH</h2>
        <table className="table">
          <tbody>
            <tr>
              <td>System</td>
              <td>
                <span className="dot green" />
                OK
              </td>
            </tr>
            <tr>
              <td>CPU</td>
              <td>{d.cpuPercent.toFixed(0)}%</td>
            </tr>
            <tr>
              <td>Memory</td>
              <td>
                {d.memUsedGb.toFixed(1)} GB / {d.memTotalGb.toFixed(0)} GB
              </td>
            </tr>
            <tr>
              <td>Buffer</td>
              <td>{d.bufferPercent}%</td>
            </tr>
            <tr>
              <td>Network</td>
              <td style={{ color: "var(--cyan)" }}>{d.networkConnected ? "CONNECTED" : "DOWN"}</td>
            </tr>
            <tr>
              <td>App</td>
              <td>{d.appVersion}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>MACHINE / FIELD BUS</h2>
        <table className="table">
          <tbody>
            <tr>
              <td>Ethernet</td>
              <td style={{ color: "var(--cyan)" }}>{d.ethernet}</td>
            </tr>
            <tr>
              <td>Firmware</td>
              <td>
                <span className="dot yellow" />
                {d.firmware}
              </td>
            </tr>
            <tr>
              <td>Latency (UI↔server)</td>
              <td>{d.latencyMs} ms</td>
            </tr>
            <tr>
              <td>Uptime</td>
              <td>{fmtUptime(d.uptimeSec)}</td>
            </tr>
            <tr>
              <td>Controller temp</td>
              <td style={{ color: "var(--yellow)" }}>{d.tempC} °C</td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: 14, display: "flex", gap: 16, alignItems: "center" }}>
          <div className="progress-mini">
            <span>X-TRAVEL</span>
            <div className="bar" style={{ width: 100 }}>
              <i style={{ width: `${state.travelPercent.x}%` }} />
            </div>
            <span>{state.travelPercent.x}%</span>
          </div>
          <div className="progress-mini">
            <span>Y-TRAVEL</span>
            <div className="bar" style={{ width: 100 }}>
              <i style={{ width: `${state.travelPercent.y}%` }} />
            </div>
            <span>{state.travelPercent.y}%</span>
          </div>
        </div>
      </div>

      <div className="panel" style={{ gridColumn: "span 2" }}>
        <h2>TEST ACTIONS (SIMULATION)</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn-outline" onClick={() => send("reset")}>
            RESET
          </button>
          <button type="button" className="btn-outline" onClick={() => send("feed_hold")}>
            FEED HOLD
          </button>
          <button type="button" className="btn-danger" onClick={() => send("estop")}>
            E-STOP
          </button>
        </div>
      </div>
    </div>
  );
}
