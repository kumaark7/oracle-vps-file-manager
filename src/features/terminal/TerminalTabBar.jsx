import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";

function StatusDot({ status }) {
  return <span className={`terminal-tab__status terminal-tab__status--${status?.kind || "connecting"}`} aria-hidden="true" />;
}

export function TerminalTabBar({ tabs, activeId, servers, chooserOpen, onSelect, onClose, onToggleChooser, onCreate }) {
  const chooserRef = useRef(null);

  useEffect(() => {
    if (!chooserOpen) return undefined;
    const close = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !chooserRef.current?.contains(event.target))) {
        onToggleChooser(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [chooserOpen, onToggleChooser]);

  return (
    <div className="terminal-tabs">
      <div className="terminal-tabs__scroll" role="tablist" aria-label="Terminal sessions">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab ${tab.id === activeId ? "terminal-tab--active" : ""}`}
            role="tab"
            aria-selected={tab.id === activeId}
          >
            <button className="terminal-tab__select" type="button" onClick={() => onSelect(tab.id)}>
              <StatusDot status={tab.status} />
              <span className="terminal-tab__label">{tab.title}</span>
            </button>
            <button
              className="terminal-tab__close"
              type="button"
              aria-label={`Close ${tab.title}`}
              title={`Close ${tab.title}`}
              onClick={() => onClose(tab.id)}
            ><X size={14} /></button>
          </div>
        ))}
      </div>
      <div className="terminal-tabs__new" ref={chooserRef}>
        <button className="terminal-tabs__plus" type="button" onClick={() => onToggleChooser(!chooserOpen)} aria-label="New terminal" title="New terminal"><Plus size={17} /></button>
        {chooserOpen && (
          <div className="terminal-server-chooser" role="menu" aria-label="New terminal server">
            <p>New Terminal</p>
            {servers.map((server) => (
              <button key={server.id} type="button" role="menuitem" onClick={() => onCreate(server.id)}>{server.name}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
