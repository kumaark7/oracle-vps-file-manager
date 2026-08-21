import { useEffect } from "react";
import { X } from "lucide-react";

export function Dialog({ title, onClose, children, footer }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="dialog-title" className="text-xl font-bold">{title}</h2>
          <button className="icon-button" type="button" aria-label="Close" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
        {footer}
      </section>
    </div>
  );
}
