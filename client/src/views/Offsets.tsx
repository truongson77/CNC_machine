import { useState } from "react";
import { useMachine } from "../machineContext";

export default function OffsetsView() {
  const { state, send } = useMachine();
  const [axis, setAxis] = useState<"X" | "Y" | "Z">("X");
  const [delta, setDelta] = useState("0");

  if (!state) return <div className="empty-state">Connecting…</div>;

  const mp = state.machinePosition;

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="panel">
        <h2>MACHINE COORDINATES</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          <div>
            <div className="dro-label">X</div>
            <div className="dro-big" style={{ fontSize: 28 }}>
              {mp.x.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="dro-label">Y</div>
            <div className="dro-big" style={{ fontSize: 28 }}>
              {mp.y.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="dro-label">Z</div>
            <div className="dro-big" style={{ fontSize: 28 }}>
              {mp.z.toFixed(3)}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>mm — machine space</p>
      </div>

      <div className="panel">
        <div className="flex-between">
          <h2 style={{ margin: 0 }}>WORK OFFSETS</h2>
          <div className="unit-toggle">
            <button
              type="button"
              className={state.unitMm ? "on" : ""}
              onClick={() => send("set_unit_mm", { mm: true })}
            >
              MM
            </button>
            <button
              type="button"
              className={!state.unitMm ? "on" : ""}
              onClick={() => send("set_unit_mm", { mm: false })}
            >
              INCH
            </button>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>CODE</th>
              <th>X</th>
              <th>Y</th>
              <th>Z</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {Object.entries(state.workOffsets).map(([code, o]) => {
              const w = o as { x: number; y: number; z: number };
              return (
                <tr key={code} className={code === state.activeWorkOffset ? "active" : ""}>
                  <td>{code}</td>
                  <td>{w.x.toFixed(4)}</td>
                  <td>{w.y.toFixed(4)}</td>
                  <td>{w.z.toFixed(4)}</td>
                  <td>
                    <button type="button" className="btn-outline" onClick={() => send("select_offset", { code })}>
                      SELECT
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>ACTIVE WORK OFFSET: {state.activeWorkOffset}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
          <button type="button" className="btn-outline" onClick={() => send("zero_axis", { which: "X" })}>
            ZERO X
          </button>
          <button type="button" className="btn-outline" onClick={() => send("zero_axis", { which: "Y" })}>
            ZERO Y
          </button>
          <button type="button" className="btn-outline" onClick={() => send("zero_axis", { which: "Z" })}>
            ZERO Z
          </button>
          <button type="button" className="btn-outline warn-border" onClick={() => send("zero_axis", { which: "ALL" })}>
            ZERO ALL
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>MANUAL PRECISION ADJUSTMENT</h2>
        <label className="dro-label" htmlFor="ax">
          AXIS
        </label>
        <select id="ax" className="input-dark" value={axis} onChange={(e) => setAxis(e.target.value as "X" | "Y" | "Z")}>
          <option value="X">X-AXIS</option>
          <option value="Y">Y-AXIS</option>
          <option value="Z">Z-AXIS</option>
        </select>
        <div style={{ marginTop: 10 }} className="flex-between">
          <input className="input-dark" value={delta} onChange={(e) => setDelta(e.target.value)} />
          <button
            type="button"
            className="btn-send"
            style={{ marginLeft: 8 }}
            onClick={() => {
              const n = Number(delta);
              if (!Number.isNaN(n)) send("apply_offset_delta", { axis, delta: n });
            }}
          >
            APPLY
          </button>
        </div>
      </div>
    </div>
  );
}
