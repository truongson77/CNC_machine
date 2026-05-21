import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useMachine } from "./machineContext";

const nav = [
  { to: "/controller", label: "Controller", ico: "⎚" },
  { to: "/offsets", label: "Offsets", ico: "▦" },
  { to: "/params", label: "Params", ico: "⚙" },
  { to: "/mdi", label: "MDI", ico: ">" },
  { to: "/diagnostics", label: "Diagnostics", ico: "▤" },
];

export default function Layout() {
  const { state, send } = useMachine();
  const loc = useLocation();

  const ms = state?.machineStatus ?? "IDLE";
  const line1 =
    ms === "EXECUTING"
      ? "MACHINE RUNNING"
      : ms === "PAUSED"
        ? "MACHINE HOLD"
        : ms === "ESTOP"
          ? "MACHINE E-STOP"
          : ms === "ERROR"
            ? "MACHINE FAULT"
            : "MACHINE IDLE";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <h1>{state?.operator.id ?? "—"}</h1>
          <p>{state?.operator.axisLocked ? "Axis Locked" : "Axes Unlocked"}</p>
        </div>
        <nav className="nav">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              <span className="ico">{n.ico}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-actions">
          <button
            type="button"
            className="btn-cycle yellow-fill"
            onClick={() => send("cycle_start")}
          >
            CYCLE START
          </button>
        </div>
        <div className="sidebar-foot">
          <button type="button">Log Out</button>
          <button type="button">Shutdown</button>
        </div>
      </aside>

      <header className="header">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="machine-line">{line1}</span>
          {loc.pathname.includes("/mdi") && (
            <span className="machine-line" style={{ color: "var(--muted)" }}>
              | {state?.mdiModeLabel ?? "MDI MODE"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="status-pill">{state?.statusLabel ?? "—"}</span>
          <div className="header-actions">
            <button type="button" className="icon-btn" title="Help">
              ?
            </button>
            <button type="button" className="icon-btn" title="Settings">
              ⚙
            </button>
            <button type="button" className="btn-outline" onClick={() => send("reset")}>
              RESET
            </button>
            <button type="button" className="btn-danger" onClick={() => send("estop")}>
              EMERGENCY STOP
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-left">
          <span>
            <span className="dot cyan" />
            {state?.diagnostics.terminalConnected ? "TERMINAL CONNECTED" : "OFFLINE"}
          </span>
          <span>
            <span className="dot green" />
            BUFFER {state?.diagnostics.bufferClear ? "CLEAR" : "BUSY"}
          </span>
          <span>CPU: {state?.diagnostics.cpuPercent?.toFixed(0) ?? "—"}%</span>
        </div>
        <div className="footer-right">
          <span>LATENCY: {state?.diagnostics.latencyMs ?? "—"}ms</span>
          <span style={{ color: "var(--muted)" }}>
            UTC: {new Date().toISOString().slice(11, 19)}
          </span>
        </div>
      </footer>
    </div>
  );
}
