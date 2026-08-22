import { useRef } from "react";
import { Archive, Download, Edit3, File, Folder, Info, MoreVertical, Trash2 } from "lucide-react";
import { formatBytes } from "./fileUtils.js";
import { ActionMenu } from "./ActionMenu.jsx";

function MenuItem({ icon: Icon, label, onClick, onClose, danger = false }) {
  return (
    <button className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${danger ? "text-rose-200 hover:bg-rose-950/60" : "text-slate-200 hover:bg-slate-800"}`} type="button" role="menuitem" onClick={() => { onClose(); onClick(); }}>
      <Icon size={16} /><span>{label}</span>
    </button>
  );
}

export function FileRow({ entry, selected, checked, menuOpen, onSelect, onToggleCheck, onOpen, onMenu, onCloseMenu, onInfo, onRename, onZip, onDelete, onDownload }) {
  const menuButtonRef = useRef(null);
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
      <td className="px-4 py-3">
        <button ref={menuButtonRef} className="icon-button" type="button" aria-label={`Actions for ${entry.name}`} title="Actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); onMenu(); }}>
          <MoreVertical size={17} />
        </button>
        {menuOpen && (
          <ActionMenu anchorRef={menuButtonRef} onClose={onCloseMenu}>
            <MenuItem icon={Info} label="Info" onClick={onInfo} onClose={onCloseMenu} />
            {entry.type === "directory" ? (
              <>
                <MenuItem icon={Edit3} label="Rename" onClick={onRename} onClose={onCloseMenu} />
                <MenuItem icon={Archive} label="Zip" onClick={onZip} onClose={onCloseMenu} />
                <MenuItem icon={Download} label="Download" onClick={onDownload} onClose={onCloseMenu} />
              </>
            ) : (
              <>
                <MenuItem icon={Download} label="Download" onClick={onDownload} onClose={onCloseMenu} />
                <MenuItem icon={Edit3} label="Edit" onClick={onOpen} onClose={onCloseMenu} />
                <MenuItem icon={Edit3} label="Rename" onClick={onRename} onClose={onCloseMenu} />
              </>
            )}
            <MenuItem icon={Trash2} label="Delete" danger onClick={onDelete} onClose={onCloseMenu} />
          </ActionMenu>
        )}
      </td>
    </tr>
  );
}
