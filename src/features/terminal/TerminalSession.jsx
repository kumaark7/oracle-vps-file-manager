import { useEffect, useRef } from "react";
import { createTerminalClient } from "./terminalClient.js";

export function TerminalSession({ tab, active, onState }) {
  const hostRef = useRef(null);
  const clientRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return undefined;
    onState(tab.id, { kind: "connecting", label: "Connecting..." });
    const client = createTerminalClient({
      element: hostRef.current,
      serverId: tab.serverId,
      path: tab.path,
      onState: (state) => onState(tab.id, state)
    });
    clientRef.current = client;
    return () => {
      clientRef.current = null;
      client.dispose();
    };
  }, [tab.id, tab.restartVersion, tab.serverId, tab.path, onState]);

  useEffect(() => {
    if (!active) return undefined;
    const frame = window.requestAnimationFrame(() => {
      clientRef.current?.fit();
      clientRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div
      ref={hostRef}
      className={`terminal-canvas ${active ? "terminal-canvas--active" : "terminal-canvas--inactive"}`}
      aria-hidden={!active}
      onClick={() => clientRef.current?.focus()}
    />
  );
}
