import { Database, Folder, Server, Smartphone } from "lucide-react";
import { formatBytes } from "../features/files/fileUtils.js";

function QuickStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-bold text-slate-100">{value}</p>
    </div>
  );
}

export function Sidebar({ server, entries, onOpenPath, onOpenStorage }) {
  const folders = entries.filter((entry) => entry.type === "directory").length;
  const files = entries.length - folders;
  const shownSize = entries.reduce((sum, entry) => sum + (entry.type === "file" ? entry.size : 0), 0);
  return (
    <aside className="space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Server size={17} className="text-emerald-300" />
          {server?.name || "Server"}
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">{server?.description || "This server is ready for file management."}</p>
        <div className="mt-3 grid gap-2 text-xs text-slate-400">
          <div className="rounded-md bg-slate-950/70 px-3 py-2">
            <span className="text-slate-500">Host</span>
            <p className="truncate font-mono text-slate-200" title={server?.host || "-"}>{server?.host || "-"}</p>
          </div>
          <div className="rounded-md bg-slate-950/70 px-3 py-2">
            <span className="text-slate-500">Login</span>
            <p className="truncate font-mono text-slate-200">{server?.username || "-"}:{server?.port || 22}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
        <QuickStat label="Folders" value={folders} />
        <QuickStat label="Files" value={files} />
        <QuickStat label="Shown size" value={formatBytes(shownSize)} />
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-300">Quick paths</p>
        <div className="space-y-2">
          {["/", "/www", "/logs", "/tmp"].map((quickPath) => (
            <button key={quickPath} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-slate-300 hover:bg-slate-800" onClick={() => onOpenPath(quickPath)} type="button">
              <Folder size={16} className="text-sky-300" />
              <span className="min-w-0 truncate">{quickPath}</span>
            </button>
          ))}
        </div>
      </div>

      <button className="storage-launcher" type="button" onClick={onOpenStorage}>
        <div className="flex items-center gap-3">
          <div className="storage-launcher__icon"><Database size={18} /></div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-100">Storage</p>
            <p className="text-xs text-slate-400">Projects, images, videos, documents for {server?.name || "this server"}</p>
          </div>
        </div>
        <Smartphone className="text-slate-400" size={18} />
      </button>
    </aside>
  );
}
