import { HardDrive, LogOut } from "lucide-react";

export function ServerSelector({ servers, currentServer, currentServerId, currentRoot, onChange, onLogout }) {
  const serverBadge = currentServer?.kind === "local" ? "Hosted here" : "Remote over SSH";
  return (
    <header className="header-stack border-b border-slate-800 pb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-400 text-slate-950">
          <HardDrive size={23} />
        </div>
        <div>
          <p className="text-sm text-slate-400">{serverBadge}</p>
          <h1 className="text-2xl font-bold tracking-normal">File Manager</h1>
        </div>
      </div>

      <div className="toolbar-shell">
        <div className="toolbar-cluster">
          <label className="server-select">
            <span className="server-select__label">Server</span>
            <select className="control server-select__input" value={currentServerId} onChange={(event) => onChange(event.target.value)}>
              {servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
            </select>
          </label>
          <div className="toolbar-chip">
            <p className="toolbar-chip__label">Protected root</p>
            <p className="toolbar-chip__value" title={currentRoot || currentServer?.rootPath || "-"}>{currentRoot || currentServer?.rootPath || "-"}</p>
          </div>
        </div>
        <button className="icon-button" type="button" aria-label="Log out" title="Log out" onClick={onLogout}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
