import { Save } from "lucide-react";

export function IconButton({ title, icon: Icon, onClick, spin = false, disabled = false }) {
  return (
    <button className="icon-button" type="button" aria-label={title} title={title} onClick={onClick} disabled={disabled}>
      <Icon className={spin ? "animate-spin" : ""} size={18} />
    </button>
  );
}

export function CommandButton({ icon: Icon, label, onClick, disabled = false, danger = false }) {
  return (
    <button
      className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${
        danger ? "border-rose-400/35 bg-rose-950/30 text-rose-100 hover:border-rose-300" : "border-slate-700 bg-slate-800 text-slate-100 hover:border-emerald-300"
      }`}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={17} />
      <span>{label}</span>
    </button>
  );
}

export function ClipboardPasteIcon(props) {
  return <Save {...props} />;
}
