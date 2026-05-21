import { useState } from "react";
import { useMachine } from "../machineContext";
import type { MdiEntryStatus } from "../types";

function statusTag(s: MdiEntryStatus, detail?: string) {
  if (s === "SUCCESS") return <span className="tag ok">SUCCESS</span>;
  if (s === "EXECUTING") return <span className="tag run">EXECUTING</span>;
  if (s === "ERR_LIMIT") return <span className="tag err">ERR: {detail ?? "LIMIT"}</span>;
  if (s === "ERR_PARSE") return <span className="tag err">ERR: {detail ?? "PARSE"}</span>;
  if (s === "OK") return <span className="tag muted">OK</span>;
  return <span className="tag muted">{s}</span>;
}

export default function MdiView() {
  const { state, send } = useMachine();
  const [line, setLine] = useState("");

  if (!state) return <div className="empty-state">Connecting…</div>;

  const sendLine = (l: string) => {
    const t = l.trim();
    if (!t) return;
    send("mdi", { line: t });
    setLine("");
  };

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ minHeight: 360 }}>
        <h2>COMMAND HISTORY</h2>
        <div style={{ overflow: "auto", maxHeight: 320 }}>
          <table className="table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>G-CODE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {state.mdiHistory.map((h) => (
                <tr key={h.id}>
                  <td style={{ color: "var(--muted)" }}>{h.ts}</td>
                  <td style={{ fontFamily: "var(--font)" }}>{h.line}</td>
                  <td>{statusTag(h.status, h.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mdi-input-row">
          <input
            className="input-dark"
            placeholder="> ENTER G-CODE COMMANDS..."
            value={line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendLine(line);
            }}
          />
          <button type="button" className="btn-send" onClick={() => sendLine(line)}>
            SEND
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="panel">
          <h2>QUICK MACROS</h2>
          <div className="macros">
            {[
              { t: "G28 (Home)", cmd: "G28" },
              { t: "M03 (Spindle On)", cmd: "M03 S2500" },
              { t: "M05 (Spindle Off)", cmd: "M05" },
              { t: "G00 (Rapid)", cmd: "G00 X0 Y0" },
              { t: "G01 (Linear)", cmd: "G01 X10 Y10 F1200" },
            ].map((m) => (
              <button key={m.cmd} type="button" className="macro-btn" onClick={() => sendLine(m.cmd)}>
                {m.t}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>DIGITAL READOUT</h2>
          <div style={{ marginTop: 8 }}>
            <div className="dro-label">X-AXIS</div>
            <div className="dro-big" style={{ fontSize: 32 }}>
              {state.position.x.toFixed(3)} mm
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="dro-label">Y-AXIS</div>
            <div className="dro-big" style={{ fontSize: 32 }}>
              {state.position.y.toFixed(3)} mm
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="dro-label">SPINDLE</div>
            <div className="dro-big" style={{ fontSize: 28, color: "var(--yellow)" }}>
              {Math.round(state.spindleRpm)} RPM
            </div>
          </div>
        </div>
      </div>

      <div className="toast">⟳ {state.systemToast}</div>
    </div>
  );
}
