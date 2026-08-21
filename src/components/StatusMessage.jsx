export function StatusMessage({ message, status }) {
  if (!message) return null;
  return (
    <div
      className={`mx-4 mt-4 rounded-lg border px-4 py-3 text-sm ${status === "error"
        ? "border-rose-400/30 bg-rose-950/40 text-rose-100"
        : "border-emerald-400/25 bg-emerald-950/30 text-emerald-100"}`}
      role={status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {message}
    </div>
  );
}
