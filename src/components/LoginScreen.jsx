import { useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Server
} from "lucide-react";

export function LoginScreen({ onLogin, onRecoveryLogin, initialError = "" }) {
  const [mode, setMode] = useState("credential");
  const [username, setUsername] = useState("admin");
  const [credential, setCredential] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [showCredential, setShowCredential] = useState(false);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "recovery") {
        await onRecoveryLogin(recoveryCode);
      } else {
        await onLogin(username, credential);
      }
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <form className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl" onSubmit={submit}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-400 text-slate-950"><Server size={22} /></div>
          <div><p className="text-sm text-slate-400">Oracle VPS</p><h1 className="text-2xl font-bold">File Manager</h1></div>
        </div>
        {error && <LoginAlert>{error}</LoginAlert>}
        {mode === "credential" ? (
          <>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">Username</span>
              <input className="control w-full" value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm text-slate-400">Password or authenticator code</span>
              <div className="relative">
                <input
                  className="control w-full pr-12"
                  type={showCredential ? "text" : "password"}
                  value={credential}
                  autoComplete="current-password"
                  onChange={(event) => setCredential(event.target.value)}
                />
                <button
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  type="button"
                  aria-label={showCredential ? "Hide credential" : "Show credential"}
                  title={showCredential ? "Hide credential" : "Show credential"}
                  onClick={() => setShowCredential((current) => !current)}
                >
                  {showCredential ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
          </>
        ) : (
          <label className="block">
            <span className="mb-2 block text-sm text-slate-400">Recovery code</span>
            <input
              className="control w-full font-mono uppercase"
              type="password"
              value={recoveryCode}
              autoComplete="one-time-code"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              spellCheck="false"
              onChange={(event) => setRecoveryCode(event.target.value)}
            />
          </label>
        )}
        <button
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
          disabled={loading || !(mode === "recovery" ? recoveryCode : credential).trim()}
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={18} />}
          Sign in
        </button>
        <button
          className="mt-4 w-full text-center text-sm font-medium text-slate-400 hover:text-emerald-300"
          type="button"
          onClick={() => switchMode(mode === "recovery" ? "credential" : "recovery")}
        >
          {mode === "recovery" ? "Use password or authenticator code" : "Use recovery code"}
        </button>
      </form>
    </main>
  );
}

function LoginAlert({ children }) {
  return <div className="mb-4 flex gap-2 rounded-lg border border-rose-400/30 bg-rose-950/40 p-3 text-sm text-rose-100" role="alert"><AlertTriangle size={18} className="shrink-0" /><span>{children}</span></div>;
}
