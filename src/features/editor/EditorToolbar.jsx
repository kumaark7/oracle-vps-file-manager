import { ArrowLeft, Loader2, Redo2, Save, Search, Undo2 } from "lucide-react";

export function EditorToolbar({ filename, path, dirty, saving, status, onBack, onSave, onUndo, onRedo, onSearch }) {
  return (
    <header className="editor-toolbar">
      <div className="editor-toolbar__identity">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Back to files" title="Back to files"><ArrowLeft size={18} /></button>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-100">{filename}{dirty && <span className="ml-1 text-amber-300" aria-label="Unsaved changes">•</span>}</h2>
          <p className="truncate font-mono text-xs text-slate-500">{path}</p>
        </div>
      </div>
      <div className="editor-toolbar__actions">
        <span className={`editor-status ${status === "error" ? "text-rose-300" : "text-slate-400"}`} role="status">{status}</span>
        <button className="icon-button" type="button" onClick={onUndo} aria-label="Undo" title="Undo"><Undo2 size={17} /></button>
        <button className="icon-button" type="button" onClick={onRedo} aria-label="Redo" title="Redo"><Redo2 size={17} /></button>
        <button className="icon-button" type="button" onClick={onSearch} aria-label="Search and replace" title="Search and replace"><Search size={17} /></button>
        <button className="editor-save-button" type="button" onClick={onSave} disabled={saving || !dirty}>
          {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
          <span>{saving ? "Saving..." : "Save"}</span>
        </button>
      </div>
    </header>
  );
}

