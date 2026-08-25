import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Server, TerminalSquare } from "lucide-react";
import { createTerminalClient } from "./terminalClient.js";
import "./terminal.css";

export default function TerminalView({ server, serverId, path, onBack }) {
  const hostRef = useRef(null);
  const [instance, setInstance] = useState(0);
  const [state, setState] = useState({ kind: "connecting", label: "Connecting..." });

  useEffect(() => {
    if (!hostRef.current) return undefined;
    setState({ kind: "connecting", label: "Connecting..." });
    const client = createTerminalClient({ element: hostRef.current, serverId, path, onState: setState });
    return () => client.dispose();
  }, [serverId, path, instance]);

  return (
    <section className="terminal-view" aria-label={`Terminal for ${server?.name || "selected server"}`}>
      <header className="terminal-toolbar">
        <div className="terminal-toolbar__identity">
          <button className="icon-button" type="button" onClick={onBack} aria-label="Back to files" title="Back to files"><ArrowLeft size={18} /></button>
          <div className="terminal-toolbar__mark"><TerminalSquare size={19} /></div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-100">Terminal</h2>
            <p className="truncate font-mono text-xs text-slate-500">{path}</p>
          </div>
        </div>
        <div className="terminal-toolbar__actions">
          <span className={`terminal-state terminal-state--${state.kind}`} role="status"><span aria-hidden="true" />{state.label}</span>
          <span className="terminal-server"><Server size={15} />{server?.name || "Server"}</span>
          <button className="icon-button" type="button" onClick={() => setInstance((value) => value + 1)} aria-label="Start a new terminal" title="Start a new terminal"><RefreshCw size={17} /></button>
        </div>
      </header>
      <div className="terminal-canvas" ref={hostRef} onClick={() => hostRef.current?.querySelector("textarea")?.focus()} />
    </section>
  );
}
