import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, RefreshCw, Server, TerminalSquare } from "lucide-react";
import { TerminalSession } from "./TerminalSession.jsx";
import { TerminalTabBar } from "./TerminalTabBar.jsx";
import { createTerminalTab, neighboringTabId, pathForNewTerminal, restartTerminalTab } from "./workspaceModel.js";
import "./terminal.css";

export default function TerminalWorkspace({ servers, currentServerId, currentPath, openRequest, visible, onBack }) {
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const createTab = useCallback((serverId, requestedPath, selectExisting = false) => {
    const server = servers.find((candidate) => candidate.id === serverId);
    if (!server) return;
    const current = tabsRef.current;
    if (selectExisting) {
      const existing = current.find((tab) => tab.serverId === serverId && tab.path === requestedPath);
      if (existing) {
        setActiveId(existing.id);
        return;
      }
    }
    const tab = createTerminalTab(current, server, requestedPath);
    const next = [...current, tab];
    tabsRef.current = next;
    setTabs(next);
    setActiveId(tab.id);
  }, [servers]);

  useEffect(() => {
    if (!openRequest?.nonce) return;
    createTab(openRequest.serverId, openRequest.path || "/", true);
  }, [openRequest?.nonce, openRequest?.serverId, openRequest?.path, createTab]);

  const updateState = useCallback((tabId, status) => {
    setTabs((current) => current.map((tab) => tab.id === tabId ? { ...tab, status } : tab));
  }, []);

  const closeTab = useCallback((tabId) => {
    const current = tabsRef.current;
    const nextActive = activeId === tabId ? neighboringTabId(current, tabId) : activeId;
    const next = current.filter((tab) => tab.id !== tabId);
    tabsRef.current = next;
    setTabs(next);
    setActiveId(nextActive);
  }, [activeId]);

  const activeTab = tabs.find((tab) => tab.id === activeId) || null;

  function createFromChooser(serverId) {
    createTab(serverId, pathForNewTerminal(serverId, currentServerId, currentPath));
    setChooserOpen(false);
  }

  function restartActive() {
    if (!activeId) return;
    setTabs((current) => {
      const next = restartTerminalTab(current, activeId);
      tabsRef.current = next;
      return next;
    });
  }

  return (
    <section className="terminal-view" aria-label="Terminal workspace">
      <TerminalTabBar
        tabs={tabs}
        activeId={activeId}
        servers={servers}
        chooserOpen={chooserOpen}
        onSelect={setActiveId}
        onClose={closeTab}
        onToggleChooser={setChooserOpen}
        onCreate={createFromChooser}
      />
      {activeTab ? (
        <>
          <header className="terminal-toolbar">
            <div className="terminal-toolbar__identity">
              <button className="icon-button" type="button" onClick={onBack} aria-label="Back to files" title="Back to files"><ArrowLeft size={18} /></button>
              <div className="terminal-toolbar__mark"><TerminalSquare size={19} /></div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-slate-100">Terminal</h2>
                <p className="truncate font-mono text-xs text-slate-500">{activeTab.path}</p>
              </div>
            </div>
            <div className="terminal-toolbar__actions">
              <span className={`terminal-state terminal-state--${activeTab.status.kind}`} role="status"><span aria-hidden="true" />{activeTab.status.label}</span>
              <span className="terminal-server"><Server size={15} />{activeTab.serverName}</span>
              <button className="icon-button" type="button" onClick={restartActive} aria-label={`Restart ${activeTab.title}`} title="Restart active terminal"><RefreshCw size={17} /></button>
            </div>
          </header>
          <div className="terminal-sessions">
            {tabs.map((tab) => (
              <TerminalSession key={tab.id} tab={tab} active={visible && tab.id === activeId} onState={updateState} />
            ))}
          </div>
        </>
      ) : (
        <div className="terminal-empty">
          <TerminalSquare size={28} />
          <h2>No terminal open</h2>
          <button type="button" onClick={() => setChooserOpen(true)}><Plus size={17} />New Terminal</button>
        </div>
      )}
    </section>
  );
}
