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
  send: (type: string, payload?: Record<string, unknown>) => void;
};

const MachineContext = createContext<Ctx | null>(null);

function wsUrl() {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  const { protocol, hostname } = window.location;
  const isHttps = protocol === "https:";
  const wsProto = isHttps ? "wss" : "ws";
  return `${wsProto}://${hostname}:3847`;
}

export function MachineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MachineState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
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
    }
  }, []);

  const value = useMemo(() => ({ state, connected, send }), [state, connected, send]);

  return <MachineContext.Provider value={value}>{children}</MachineContext.Provider>;
}

export function useMachine() {
  const ctx = useContext(MachineContext);
  if (!ctx) throw new Error("useMachine outside provider");
  return ctx;
}
