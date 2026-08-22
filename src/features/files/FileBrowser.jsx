import { useRef } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Toolbar } from "../../components/Toolbar.jsx";
import { StatusMessage } from "../../components/StatusMessage.jsx";
import { FileRow } from "./FileRow.jsx";

function PathCrumbs({ path, onOpen }) {
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ label: "/", path: "/" }, ...parts.map((part, index) => ({ label: part, path: `/${parts.slice(0, index + 1).join("/")}` }))];
  return (
    <nav className="flex flex-wrap items-center gap-1 px-4 pb-4 text-sm text-slate-400" aria-label="Current folder">
      {crumbs.map((crumb, index) => (
        <span className="contents" key={crumb.path}>
          {index > 0 && <ChevronRight size={15} aria-hidden="true" />}
          <button className="rounded-md px-2 py-1 hover:bg-slate-800 hover:text-slate-100" type="button" onClick={() => onOpen(crumb.path)}>{crumb.label}</button>
        </span>
      ))}
    </nav>
  );
}

export function FileBrowser({ state, visibleEntries, allVisibleSelected, actions }) {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const busy = state.status === "loading" || state.status === "working";

  return (
    <section className="min-w-0 rounded-lg border border-slate-800 bg-slate-900">
      <Toolbar
        query={state.query}
        onQueryChange={actions.setQuery}
        busy={busy}
        selectedCount={state.selectedPaths.length}
        hasClipboard={Boolean(state.clipboard?.items?.length)}
        clipboardOperation={state.clipboard?.operation}
        onBack={actions.back}
        onHome={actions.home}
        onCopySshPath={actions.copySshPath}
        onCopyCmdPath={actions.copyCmdPath}
        onRefresh={actions.refresh}
        onUpload={() => fileInputRef.current?.click()}
        onUploadFolder={() => folderInputRef.current?.click()}
        onNewFolder={actions.newFolder}
        onNewFile={actions.newFile}
        onCopy={() => actions.beginClipboard("copy")}
        onCut={() => actions.beginClipboard("cut")}
        onPaste={actions.paste}
        onClearSelection={actions.clearSelection}
        onDeleteSelection={actions.deleteSelection}
      />
      <input ref={fileInputRef} className="hidden" type="file" multiple onChange={actions.upload} />
      <input ref={folderInputRef} className="hidden" type="file" multiple webkitdirectory="" onChange={actions.upload} />
      <StatusMessage message={state.message} status={state.status} />
      <PathCrumbs path={state.currentPath} onOpen={actions.openPath} />
      <div className="file-table-wrap">
        <table className="w-full min-w-[720px] border-t border-slate-800 text-left">
          <thead className="bg-slate-950/55 text-xs uppercase tracking-normal text-slate-500">
            <tr>
              <th className="w-14 px-4 py-3 font-semibold">
                <label className="flex items-center justify-center"><input className="selection-checkbox" type="checkbox" checked={allVisibleSelected} onChange={actions.toggleSelectAll} aria-label="Select all visible items" /></label>
              </th>
              <th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Size</th><th className="px-4 py-3 font-semibold">Modified</th><th className="px-4 py-3 font-semibold">Permissions</th><th className="w-16 px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {busy && !state.entries.length ? (
              <tr><td className="px-4 py-16 text-center text-slate-400" colSpan="6"><Loader2 className="mx-auto mb-3 animate-spin text-emerald-300" />Loading files</td></tr>
            ) : visibleEntries.length ? visibleEntries.map((entry) => (
              <FileRow
                key={entry.path}
                entry={entry}
                selected={state.selected?.path === entry.path}
                checked={state.selectedPaths.includes(entry.path)}
                menuOpen={state.menuFor === entry.path}
                onSelect={() => actions.select(entry)}
                onToggleCheck={() => actions.toggleSelected(entry.path)}
                onOpen={() => actions.openEntry(entry)}
                onMenu={() => actions.setMenuFor(state.menuFor === entry.path ? null : entry.path)}
                onCloseMenu={() => actions.setMenuFor(null)}
                onInfo={() => actions.info(entry)}
                onRename={() => actions.rename(entry)}
                onZip={() => actions.zip(entry)}
                onDelete={() => actions.remove(entry)}
                onDownload={() => actions.download(entry)}
              />
            )) : <tr><td className="px-4 py-16 text-center text-slate-400" colSpan="6">No files found in this folder.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
