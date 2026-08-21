import { useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, Lock, Server } from "lucide-react";

export function LoginScreen({ onLogin, passwordConfigured, initialError = "" }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try { await onLogin(username, password); }
    catch (loginError) { setError(loginError.message); }
    finally { setLoading(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <form className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl" onSubmit={submit}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-400 text-slate-950"><Server size={22} /></div>
          <div><p className="text-sm text-slate-400">Oracle VPS</p><h1 className="text-2xl font-bold">File Manager</h1></div>
        </div>
        {!passwordConfigured && <LoginAlert tone="amber">Set ADMIN_PASSWORD on the server before logging in.</LoginAlert>}
        {error && <LoginAlert tone="rose">{error}</LoginAlert>}
        <label className="block">
          <span className="mb-2 block text-sm text-slate-400">Username</span>
          <input className="control w-full" value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm text-slate-400">Password</span>
          <div className="relative">
            <input className="control w-full pr-12" type={showPassword ? "text" : "password"} value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
            <button className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100" type="button" aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50" disabled={loading || !passwordConfigured}>
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />} Sign in
        </button>
      </form>
    </main>
  );
}

function LoginAlert({ tone, children }) {
  const classes = tone === "amber" ? "border-amber-300/30 bg-amber-950/40 text-amber-100" : "border-rose-400/30 bg-rose-950/40 text-rose-100";
  return <div className={`mb-4 flex gap-2 rounded-lg border p-3 text-sm ${classes}`} role="alert"><AlertTriangle size={18} className="shrink-0" /><span>{children}</span></div>;
}
