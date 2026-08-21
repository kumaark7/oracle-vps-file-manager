import { useEffect, useState } from "react";
import { AlertTriangle, FilePlus2, Loader2, Save, Trash2 } from "lucide-react";
import { apiPath, requestJson, requestText } from "../../api/client.js";
import { Dialog } from "../../components/Dialog.jsx";
import { formatBytes, parentPath } from "./fileUtils.js";

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-[140px_minmax(0,1fr)]">
      <div className="text-sm font-semibold text-slate-400">{label}</div>
      <div className={`break-all text-sm text-slate-100 ${mono ? "font-mono" : ""}`}>{value || "-"}</div>
    </div>
  );
}

export function FileDialog({ dialog, serverId, currentPath, onClose, handlers }) {
  const [name, setName] = useState(dialog.entry?.name || "");
  const [content, setContent] = useState("");
  const [details, setDetails] = useState(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(["edit", "info"].includes(dialog.type));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (dialog.type === "edit") {
      requestText(apiPath("/api/read", serverId, { path: dialog.entry.path }))
        .then((value) => { if (!cancelled) setContent(value); })
        .catch((readError) => { if (!cancelled) setError(readError.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else if (dialog.type === "info") {
      requestJson(apiPath("/api/details", serverId, { path: dialog.entry.path }))
        .then((value) => {
          if (cancelled) return;
          setDetails(value);
          setComment(value.comment || "");
        })
        .catch((detailsError) => { if (!cancelled) setError(detailsError.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [dialog, serverId]);

  const titles = {
    folder: "New folder", file: "New file", rename: "Rename item", delete: "Delete item",
    bulkDelete: "Delete selected items", edit: `Edit ${dialog.entry?.name || "file"}`, info: `Details for ${dialog.entry?.name || "item"}`
  };

  async function submit(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (dialog.type === "folder" && trimmedName) await handlers.createFolder(trimmedName);
    if (dialog.type === "file" && trimmedName) await handlers.createFile(trimmedName, content);
    if (dialog.type === "rename" && trimmedName) await handlers.rename(dialog.entry, trimmedName);
    if (dialog.type === "delete") await handlers.remove(dialog.entry);
    if (dialog.type === "bulkDelete") await handlers.deleteBulk(dialog.paths);
    if (dialog.type === "info") await handlers.saveComment(dialog.entry, comment);
    if (dialog.type === "edit") await handlers.saveFile(dialog.entry, content);
  }

  const destructive = ["delete", "bulkDelete"].includes(dialog.type);
  const footer = (
    <div className="mt-5 flex justify-end gap-2">
      <button className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300" type="button" onClick={onClose}>Cancel</button>
      <button form="file-dialog-form" className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${destructive ? "bg-rose-400 text-slate-950" : "bg-emerald-400 text-slate-950"}`} type="submit" disabled={loading || Boolean(error)}>
        {dialog.type === "edit" || dialog.type === "info" ? <Save size={17} /> : destructive ? <Trash2 size={17} /> : <FilePlus2 size={17} />}
        {destructive ? "Delete" : dialog.type === "info" ? "Save Note" : "Save"}
      </button>
    </div>
  );

  return (
    <Dialog title={titles[dialog.type]} onClose={onClose} footer={footer}>
      <form id="file-dialog-form" onSubmit={submit}>
        {error && <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-950/40 p-3 text-sm text-rose-100" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}
        {dialog.type === "delete" ? (
          <p className="text-sm leading-6 text-slate-300">Delete <span className="font-semibold text-rose-200">{dialog.entry.name}</span> from <span className="font-mono text-slate-400">{parentPath(dialog.entry.path)}</span>?</p>
        ) : dialog.type === "bulkDelete" ? (
          <p className="text-sm leading-6 text-slate-300">Delete <span className="font-semibold text-rose-200">{dialog.paths.length}</span> selected item{dialog.paths.length === 1 ? "" : "s"} from <span className="font-mono text-slate-400">{currentPath}</span>?</p>
        ) : dialog.type === "info" ? loading ? <Loading label="Loading details" /> : (
          <div className="space-y-4">
            <DetailRow label="Type" value={details?.type} /><DetailRow label="Size" value={formatBytes(details?.size || 0)} />
            <DetailRow label="Location" value={details?.location || "/"} mono /><DetailRow label="Path" value={details?.path} mono />
            <DetailRow label="Modified" value={details?.modified} /><DetailRow label="Last Used" value={details?.lastUsed} /><DetailRow label="Created Date" value={details?.created} />
            <label className="block"><span className="mb-2 block text-sm text-slate-400">Comment</span><textarea className="min-h-32 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:border-emerald-300" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a note for this file or folder" /></label>
          </div>
        ) : dialog.type === "edit" ? loading ? <Loading label="Loading file" /> : (
          <textarea className="min-h-[360px] w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-100 outline-none focus:border-emerald-300" value={content} onChange={(event) => setContent(event.target.value)} aria-label="File content" />
        ) : (
          <>
            <label className="block"><span className="mb-2 block text-sm text-slate-400">Name</span><input className="control w-full" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
            {dialog.type === "file" && <label className="mt-4 block"><span className="mb-2 block text-sm text-slate-400">Content</span><textarea className="min-h-44 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-100 outline-none focus:border-emerald-300" value={content} onChange={(event) => setContent(event.target.value)} /></label>}
            <p className="mt-3 font-mono text-xs text-slate-500">{currentPath}</p>
          </>
        )}
      </form>
    </Dialog>
  );
}

function Loading({ label }) {
  return <div className="flex h-64 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} />{label}</div>;
}
