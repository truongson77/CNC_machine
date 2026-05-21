import { useMachine } from "../machineContext";

export default function ControllerView() {
  const { state, send } = useMachine();
  if (!state) return <div className="empty-state">Connecting…</div>;

  const { gcode, position, feedOverridePercent, spindleOverridePercent, spindleCommandRpm } =
    state;
  const idx = gcode.currentLineIndex;

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="panel">
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>DIGITAL READOUT</h2>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>MM</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="dro-label">X-AXIS</div>
              <div className="dro-big">{position.x.toFixed(3)}</div>
            </div>
            <div>
              <div className="dro-label">Y-AXIS</div>
              <div className="dro-big">{position.y.toFixed(3)}</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="flex-between">
            <h2 style={{ margin: 0 }}>G-CODE STREAM</h2>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              {gcode.filename} — Line {idx + 1} / {gcode.lines.length}
            </span>
          </div>
          <div className="gcode-view">
            {gcode.lines.map((line, i) => {
              let cls = "gcode-line";
              if (i < idx) cls += " dim";
              else if (i === idx) cls += " current";
              else if (i === idx + 1) cls += " next";
              return (
                <div key={i} className={cls}>
                  <span className="ln">{i + 1}</span>
                  <span>{line}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="panel">
          <h2>JOG</h2>
          <div className="jog-pad">
            <span />
            <button type="button" onClick={() => send("jog", { axis: "Y", direction: 1, rapid: false, stepMm: 0.01 })}>
              Y+
            </button>
            <span />
            <button type="button" onClick={() => send("jog", { axis: "X", direction: -1, rapid: false, stepMm: 0.01 })}>
              X−
            </button>
            <button type="button" title="Home jog" onClick={() => send("force_homing")}>
              ⌖
            </button>
            <button type="button" onClick={() => send("jog", { axis: "X", direction: 1, rapid: false, stepMm: 0.01 })}>
              X+
            </button>
            <span />
            <button type="button" onClick={() => send("jog", { axis: "Y", direction: -1, rapid: false, stepMm: 0.01 })}>
              Y−
            </button>
            <span />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="btn-outline" onClick={() => send("jog", { axis: "X", direction: 1, rapid: true, stepMm: 0.01 })}>
              RAPID
            </button>
            <span style={{ fontSize: 11, color: "var(--muted)", alignSelf: "center" }}>
              STEP: 0.01 mm
            </span>
          </div>
        </div>

        <div className="panel">
          <h2>OVERRIDES</h2>
          <div className="slider-row">
            <label>
              <span>FEED RATE OVERRIDE</span>
              <span style={{ color: "var(--cyan)" }}>{feedOverridePercent}%</span>
            </label>
            <div className="bar">
              <i style={{ width: `${Math.min(100, feedOverridePercent)}%` }} />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button type="button" className="btn-outline" onClick={() => send("feed_override", { delta: -10 })}>
                −
              </button>
              <button type="button" className="btn-outline" onClick={() => send("feed_override", { delta: 10 })}>
                +
              </button>
            </div>
          </div>
          <div className="slider-row">
            <label>
              <span>SPINDLE COMMAND</span>
              <span style={{ color: "var(--yellow)" }}>
                {Math.round((spindleCommandRpm * spindleOverridePercent) / 100)} RPM
              </span>
            </label>
            <div className="bar yellow">
              <i style={{ width: `${Math.min(100, spindleOverridePercent)}%` }} />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button type="button" className="btn-outline" onClick={() => send("spindle_override", { delta: -10 })}>
                −
              </button>
              <button type="button" className="btn-outline" onClick={() => send("spindle_override", { delta: 10 })}>
                +
              </button>
            </div>
          </div>
        </div>

        <button type="button" className="btn-cycle yellow-fill" onClick={() => send("feed_hold")}>
          FEED HOLD
        </button>
      </div>
    </div>
  );
}
