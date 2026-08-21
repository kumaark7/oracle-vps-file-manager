import { ArrowLeft, Copy, FilePlus2, Folder, FolderPlus, Home, Loader2, RefreshCcw, Scissors, Search, Trash2, Upload, X } from "lucide-react";
import { ClipboardPasteIcon, CommandButton, IconButton } from "./Buttons.jsx";

export function Toolbar({
  currentPath, query, onQueryChange, busy, selectedCount, hasClipboard, clipboardOperation,
  onBack, onHome, onRefresh, onUpload, onUploadFolder, onNewFolder, onNewFile,
  onCopy, onCut, onPaste, onClearSelection, onDeleteSelection
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton title="Back" icon={ArrowLeft} onClick={onBack} />
          <IconButton title="Home" icon={Home} onClick={onHome} />
          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-300">
            <span className="block truncate">{currentPath}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton title="Refresh" icon={busy ? Loader2 : RefreshCcw} onClick={onRefresh} spin={busy} disabled={busy} />
          <CommandButton icon={Upload} label="Upload" onClick={onUpload} disabled={busy} />
          <CommandButton icon={Folder} label="Folder Upload" onClick={onUploadFolder} disabled={busy} />
          <CommandButton icon={FolderPlus} label="Folder" onClick={onNewFolder} disabled={busy} />
          <CommandButton icon={FilePlus2} label="File" onClick={onNewFile} disabled={busy} />
        </div>
      </div>

      <label className="search-field">
        <span className="sr-only">Search in this folder</span>
        <Search className="search-field__icon" size={18} />
        <input className="control search-field__input w-full" placeholder="Search in this folder" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      </label>

      {(selectedCount > 0 || hasClipboard) && (
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-400/20 bg-emerald-950/20 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-slate-200">
            {selectedCount > 0 ? `${selectedCount} item${selectedCount === 1 ? "" : "s"} selected` : `Clipboard ready for ${clipboardOperation === "cut" ? "move" : "copy"}`}
          </div>
          <div className="flex flex-wrap gap-2">
            <CommandButton icon={Copy} label="Copy" onClick={onCopy} disabled={!selectedCount} />
            <CommandButton icon={Scissors} label="Cut" onClick={onCut} disabled={!selectedCount} />
            <CommandButton icon={ClipboardPasteIcon} label="Paste Here" onClick={onPaste} disabled={!hasClipboard} />
            <CommandButton icon={Trash2} label="Delete" onClick={onDeleteSelection} disabled={!selectedCount} danger />
            <CommandButton icon={X} label="Clear" onClick={onClearSelection} disabled={!selectedCount} />
          </div>
        </div>
      )}
    </div>
  );
}
