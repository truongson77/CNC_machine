import { useEffect, useState } from "react";
import { useMachine } from "../machineContext";

export default function ParamsView() {
  const { state, send } = useMachine();
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!state || dirty) return;
    setDraft({
      sx: String(state.axisMotor.x.stepsPerMm),
      vx: String(state.axisMotor.x.velocityMmMin),
      ax: String(state.axisMotor.x.accelMmS2),
      sy: String(state.axisMotor.y.stepsPerMm),
      vy: String(state.axisMotor.y.velocityMmMin),
      ay: String(state.axisMotor.y.accelMmS2),
      invertX: state.invertX,
      invertY: state.invertY,
      softLimits: state.softLimits,
      autoZeroHome: state.autoZeroHome,
      xMin: String(state.limits.xMin),
      xMax: String(state.limits.xMax),
      yMin: String(state.limits.yMin),
      yMax: String(state.limits.yMax),
      homeX: String(state.homing.homeX),
      homeY: String(state.homing.homeY),
      homingSpeed: String(state.homing.speedMmMin),
      seek: String(state.homing.seekDistance),
      pwm: String(state.spindle.pwmHz),
      pulley: String(state.spindle.pulleyRatio),
      cool: String(state.spindle.coolantDelayS),
    });
  }, [state, dirty]);

  if (!state) return <div className="empty-state">Connecting…</div>;

  const markDirty = () => setDirty(true);

  const num = (k: string) => {
    const v = parseFloat(String(draft[k] ?? "0"));
    return Number.isFinite(v) ? v : 0;
  };

  const save = () => {
    send("config_patch", {
      axisMotor: {
        x: { stepsPerMm: num("sx"), velocityMmMin: num("vx"), accelMmS2: num("ax") },
        y: { stepsPerMm: num("sy"), velocityMmMin: num("vy"), accelMmS2: num("ay") },
      },
      invertX: Boolean(draft.invertX),
      invertY: Boolean(draft.invertY),
      softLimits: Boolean(draft.softLimits),
      autoZeroHome: Boolean(draft.autoZeroHome),
      limits: { xMin: num("xMin"), xMax: num("xMax"), yMin: num("yMin"), yMax: num("yMax") },
      homing: {
        homeX: num("homeX"),
        homeY: num("homeY"),
        speedMmMin: num("homingSpeed"),
        seekDistance: num("seek"),
      },
      spindle: { pwmHz: num("pwm"), pulleyRatio: num("pulley"), coolantDelayS: num("cool") },
    });
    setDirty(false);
  };

  const exportCfg = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cnc-config.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const field = (key: string, label: string) => (
    <label key={key} style={{ display: "block", marginBottom: 8 }}>
      <div className="dro-label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <input
        className="input-dark"
        value={String(draft[key] ?? "")}
        onChange={(e) => {
          markDirty();
          setDraft((d) => ({ ...d, [key]: e.target.value }));
        }}
      />
    </label>
  );

  const toggle = (key: string, label: string) => (
    <div key={key} className="toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className={`toggle ${draft[key] ? "on" : ""}`}
        aria-pressed={Boolean(draft[key])}
        onClick={() => {
          markDirty();
          setDraft((d) => ({ ...d, [key]: !Boolean(d[key]) }));
        }}
      />
    </div>
  );

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, color: "var(--cyan)" }}>AXIS CONFIGURATION &amp; TUNING</h2>
          <div className="breadcrumb">System Parameters / Motion Control / XY Stage</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn-outline" onClick={exportCfg}>
            EXPORT CFG
          </button>
          <button type="button" className="btn-send" onClick={save}>
            SAVE CONFIGURATION
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>MOTOR TUNING &amp; PERFORMANCE</h2>
          <div className="grid-2">
            <div>
              <div className="dro-label" style={{ marginBottom: 6 }}>
                AXIS X
              </div>
              <button type="button" className="btn-outline" style={{ marginBottom: 8 }} onClick={() => send("test_motor", { axis: "X" })}>
                TEST MOTOR
              </button>
              {field("sx", "Steps Per Unit (steps/mm)")}
              {field("vx", "Velocity (mm/min)")}
              {field("ax", "Acceleration (mm/s²)")}
            </div>
            <div>
              <div className="dro-label" style={{ marginBottom: 6 }}>
                AXIS Y
              </div>
              <button type="button" className="btn-outline" style={{ marginBottom: 8 }} onClick={() => send("test_motor", { axis: "Y" })}>
                TEST MOTOR
              </button>
              {field("sy", "Steps Per Unit (steps/mm)")}
              {field("vy", "Velocity (mm/min)")}
              {field("ay", "Acceleration (mm/s²)")}
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>HOMING SETTINGS</h2>
          <div className="grid-2">
            {field("homeX", "Home Location X")}
            {field("homeY", "Home Location Y")}
          </div>
          {field("homingSpeed", "Homing Speed (mm/min)")}
          {field("seek", "Homing Seek Distance")}
          <button type="button" className="btn-cycle warn-border" style={{ width: "100%", marginTop: 10 }} onClick={() => send("force_homing")}>
            FORCE SYSTEM HOMING
          </button>
        </div>

        <div className="panel">
          <h2>AXIS HARDWARE</h2>
          {toggle("invertX", "Invert Direction (X)")}
          {toggle("invertY", "Invert Direction (Y)")}
          {toggle("softLimits", "Soft Limits Enabled")}
          {toggle("autoZeroHome", "Auto-Zero on Home")}
          <div className="grid-2" style={{ marginTop: 10 }}>
            <div>
              <div className="dro-label">X MIN LIMIT</div>
              <input
                className="input-dark"
                value={String(draft.xMin ?? "")}
                onChange={(e) => {
                  markDirty();
                  setDraft((d) => ({ ...d, xMin: e.target.value }));
                }}
              />
            </div>
            <div>
              <div className="dro-label">X MAX LIMIT</div>
              <input
                className="input-dark"
                value={String(draft.xMax ?? "")}
                onChange={(e) => {
                  markDirty();
                  setDraft((d) => ({ ...d, xMax: e.target.value }));
                }}
              />
            </div>
            <div>
              <div className="dro-label">Y MIN LIMIT</div>
              <input
                className="input-dark"
                value={String(draft.yMin ?? "")}
                onChange={(e) => {
                  markDirty();
                  setDraft((d) => ({ ...d, yMin: e.target.value }));
                }}
              />
            </div>
            <div>
              <div className="dro-label">Y MAX LIMIT</div>
              <input
                className="input-dark"
                value={String(draft.yMax ?? "")}
                onChange={(e) => {
                  markDirty();
                  setDraft((d) => ({ ...d, yMax: e.target.value }));
                }}
              />
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>SPINDLE &amp; COOLANT</h2>
          <label className="dro-label">PWM Frequency (Hz)</label>
          <select
            className="input-dark"
            value={String(draft.pwm ?? "5000")}
            onChange={(e) => {
              markDirty();
              setDraft((d) => ({ ...d, pwm: e.target.value }));
            }}
          >
            {[1000, 2500, 5000, 8000, 20000].map((hz) => (
              <option key={hz} value={hz}>
                {hz} Hz
              </option>
            ))}
          </select>
          {field("pulley", "Pulley Ratios (Motor:Spindle)")}
          {field("cool", "Coolant Start Delay (s)")}
          <div style={{ marginTop: 12, fontSize: 11, display: "flex", gap: 16 }}>
            <span style={{ color: "var(--muted)" }}>MIST: {state.spindle.mist}</span>
            <span style={{ color: "var(--cyan)" }}>FLOOD: {state.spindle.flood}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
