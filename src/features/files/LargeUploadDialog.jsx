import { useState } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Dialog } from "../../components/Dialog.jsx";
import { formatBytes } from "./fileUtils.js";

export function LargeUploadDialog({ count, maximumBytes, onAuthorize, onCancel }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onAuthorize(password);
    } catch (authorizationError) {
      setError(authorizationError.message);
      setLoading(false);
    }
  }

  const footer = (
    <div className="mt-5 flex justify-end gap-2">
      <button className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300" type="button" onClick={onCancel} disabled={loading}>Cancel</button>
      <button form="large-upload-form" className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50" type="submit" disabled={loading || !password}>
        {loading ? <Loader2 className="animate-spin" size={17} /> : <KeyRound size={17} />}
        Authorize upload
      </button>
    </div>
  );

  return (
    <Dialog title="Authorize large upload" onClose={() => { if (!loading) onCancel(); }} footer={footer}>
      <form id="large-upload-form" onSubmit={submit}>
        {error && <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-950/40 p-3 text-sm text-rose-100" role="alert"><AlertTriangle className="shrink-0" size={18} /><span>{error}</span></div>}
        <p className="text-sm leading-6 text-slate-300">
          {count} selected file{count === 1 ? " is" : "s are"} above the standard 2 GB limit. Enter the account password to continue. The maximum is {formatBytes(maximumBytes)} per file.
        </p>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm text-slate-400">Password</span>
          <div className="relative">
            <input className="control w-full pr-12" type={showPassword ? "text" : "password"} value={password} autoComplete="current-password" autoFocus onChange={(event) => setPassword(event.target.value)} />
            <button className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100" type="button" aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
      </form>
    </Dialog>
  );
}
