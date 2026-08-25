import { Dialog } from "../../components/Dialog.jsx";

export function UnsavedChangesDialog({ onStay, onDiscard }) {
  const footer = (
    <div className="mt-5 flex justify-end gap-2">
      <button className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200" type="button" onClick={onStay}>Stay</button>
      <button className="rounded-lg bg-rose-400 px-4 py-2 text-sm font-bold text-slate-950" type="button" onClick={onDiscard}>Discard</button>
    </div>
  );
  return (
    <Dialog title="Unsaved changes" onClose={onStay} footer={footer}>
      <p className="text-sm leading-6 text-slate-300">Your edits have not been saved. Discard them and continue?</p>
    </Dialog>
  );
}

