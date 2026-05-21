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
  sendError: string | null;
  send: (type: string, payload?: Record<string, unknown>) => boolean;
};

const MachineContext = createContext<Ctx | null>(null);

function wsUrl() {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  const host =
    import.meta.env.DEV && window.location.hostname === "localhost"
      ? "127.0.0.1"
      : window.location.hostname;
  return `ws://${host}:3847`;
}

export function MachineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MachineState | null>(null);
  const [connected, setConnected] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
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
    setSendError("Not connected to server — start npm run dev:com12");
    return false;
  }, []);

  const value = useMemo(
    () => ({ state, connected, sendError, send }),
    [state, connected, sendError, send],
  );

  return <MachineContext.Provider value={value}>{children}</MachineContext.Provider>;
}

export function useMachine() {
  const ctx = useContext(MachineContext);
  if (!ctx) throw new Error("useMachine outside provider");
  return ctx;
}
