import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MachineState } from "./types";

type Ctx = {
  state: MachineState | null;
  connected: boolean;
  serverReachable: boolean | null;
  sendError: string | null;
  send: (type: string, payload?: Record<string, unknown>) => boolean;
};

const MachineContext = createContext<Ctx | null>(null);

/**
 * Dev: WebSocket via Vite proxy (ws://localhost:5173/ws → server :3847).
 * Avoids connecting the browser directly to port 3847 (often blocked on Windows).
 */
function wsUrl() {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;

  if (import.meta.env.DEV) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  const port = import.meta.env.VITE_SERVER_PORT ?? "3847";
  return `${proto}//${host}:${port}`;
}

export function MachineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MachineState | null>(null);
  const [connected, setConnected] = useState(false);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch("/api/hardware")
      .then((r) => setServerReachable(r.ok))
      .catch(() => setServerReachable(false));
  }, [connected]);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const url = wsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        setSendError(null);
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!stopped) retry = setTimeout(connect, 1200);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type: string; payload?: MachineState };
          if (msg.type === "state" && msg.payload) setState(msg.payload);
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((type: string, payload?: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload: payload ?? {} }));
      setSendError(null);
      return true;
    }
    setSendError("Not connected to server — run npm run dev:com12 from project root");
    return false;
  }, []);

  const value = useMemo(
    () => ({ state, connected, serverReachable, sendError, send }),
    [state, connected, serverReachable, sendError, send],
  );

  return <MachineContext.Provider value={value}>{children}</MachineContext.Provider>;
}

export function useMachine() {
  const ctx = useContext(MachineContext);
  if (!ctx) throw new Error("useMachine outside provider");
  return ctx;
}
