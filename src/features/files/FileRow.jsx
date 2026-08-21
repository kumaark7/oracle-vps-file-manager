import { Download, Edit3, File, Folder, Info, MoreVertical, Trash2 } from "lucide-react";
import { formatBytes } from "./fileUtils.js";

function MenuItem({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${danger ? "text-rose-200 hover:bg-rose-950/60" : "text-slate-200 hover:bg-slate-800"}`} type="button" onClick={onClick}>
      <Icon size={16} /><span>{label}</span>
    </button>
  );
}

export function FileRow({ entry, selected, checked, menuOpen, menuDirection = "down", onSelect, onToggleCheck, onOpen, onMenu, onInfo, onRename, onDelete, onDownload }) {
  const EntryIcon = entry.type === "directory" ? Folder : File;
  return (
    <tr className={`border-t border-slate-800 text-sm hover:bg-slate-800/60 ${selected ? "bg-slate-800" : ""}`} onClick={onSelect}>
      <td className="px-4 py-3">
        <label className="flex items-center justify-center">
          <input className="selection-checkbox" type="checkbox" checked={checked} onChange={onToggleCheck} onClick={(event) => event.stopPropagation()} aria-label={`Select ${entry.name}`} />
        </label>
      </td>
      <td className="max-w-[360px] px-4 py-3">
        <button className="flex min-w-0 items-center gap-3 text-left" type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }}>
          <EntryIcon size={20} className={entry.type === "directory" ? "shrink-0 text-sky-300" : "shrink-0 text-slate-400"} />
          <span className="truncate font-medium text-slate-100">{entry.name}</span>
        </button>
      </td>
      <td className="px-4 py-3 text-slate-400">{entry.type === "directory" ? "-" : formatBytes(entry.size)}</td>
      <td className="px-4 py-3 text-slate-400">{entry.modified}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">{entry.mode}</td>
      <td className="relative px-4 py-3" data-menu-root>
        <button className="icon-button" type="button" aria-label={`Actions for ${entry.name}`} title="Actions" aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); onMenu(); }}>
          <MoreVertical size={17} />
        </button>
        {menuOpen && (
          <div className={`absolute right-4 z-20 w-44 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-2xl ${menuDirection === "up" ? "bottom-11" : "top-11"}`}>
            <MenuItem icon={Info} label="Info" onClick={onInfo} />
            {entry.type === "file" && <MenuItem icon={Download} label="Download" onClick={onDownload} />}
            {entry.type === "file" && <MenuItem icon={Edit3} label="Edit" onClick={onOpen} />}
            <MenuItem icon={Edit3} label="Rename" onClick={onRename} />
            <MenuItem icon={Trash2} label="Delete" danger onClick={onDelete} />
          </div>
        )}
      </td>
    </tr>
  );
}
