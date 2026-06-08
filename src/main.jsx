import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Database,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  Info,
  Scissors,
  Loader2,
  Lock,
  LogOut,
  MoreVertical,
  RefreshCcw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  X
} from "lucide-react";
import "./styles.css";

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function joinPath(base, name) {
  if (base === "/") return `/${name}`;
  return `${base.replace(/\/$/, "")}/${name}`;
}

function parentPath(path) {
  if (!path || path === "/") return "/";
  const clean = path.replace(/\/$/, "");
  const index = clean.lastIndexOf("/");
  return index <= 0 ? "/" : clean.slice(0, index);
}

function encodeBinaryBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function encodeTextBase64(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function decodeTextBase64(text) {
  return decodeURIComponent(escape(atob(text)));
}

function formatCompactBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const decimals = index >= 3 ? 1 : 0;
  return `${(bytes / 1024 ** index).toFixed(decimals)} ${units[index]}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function App() {
  const [session, setSession] = useState({ loading: true, authenticated: false, passwordConfigured: true, fileRoot: "" });
  const [activeView, setActiveView] = useState("files");
  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [clipboard, setClipboard] = useState(null);
  const [storage, setStorage] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [menuFor, setMenuFor] = useState(null);
  const [dialog, setDialog] = useState(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const folders = entries.filter((entry) => entry.type === "directory").length;
  const files = entries.length - folders;
  const totalSize = entries.reduce((sum, entry) => sum + (entry.type === "file" ? entry.size : 0), 0);

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return needle ? sorted.filter((entry) => entry.name.toLowerCase().includes(needle)) : sorted;
  }, [entries, query]);

  const allVisibleSelected = visibleEntries.length > 0 && visibleEntries.every((entry) => selectedPaths.includes(entry.path));

  useEffect(() => {
    refreshSession();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (session.authenticated) loadFiles("/");
  }, [session.authenticated]);

  async function refreshSession() {
    try {
      const data = await api("/api/session");
      setSession({ loading: false, ...data });
    } catch (error) {
      setSession((current) => ({ ...current, loading: false }));
      setMessage(error.message);
    }
  }

  async function login(username, password) {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    setSession({ loading: false, authenticated: true, username: data.username, fileRoot: data.fileRoot, passwordConfigured: true });
  }

  async function logout() {
    await api("/api/logout", { method: "POST", body: "{}" });
    setEntries([]);
    setActiveView("files");
    setSession((current) => ({ ...current, authenticated: false }));
  }

  async function loadFiles(path = currentPath) {
    setStatus("loading");
    setMessage("");
    setSelected(null);
    setSelectedPaths([]);
    setActiveView("files");

    try {
      const data = await api(`/api/files?path=${encodeURIComponent(path)}`);
      setEntries(data.entries);
      setCurrentPath(data.path);
      setSession((current) => ({ ...current, fileRoot: data.root || current.fileRoot }));
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
      if (error.message === "Login required") setSession((current) => ({ ...current, authenticated: false }));
    }
  }

  async function loadStorage() {
    setStatus("working");
    setMessage("");

    try {
      const data = await api("/api/storage");
      setStorage(data);
      setActiveView("storage");
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  async function runAction(action, body, successText) {
    setStatus("working");
    setMessage("");

    try {
      await api(`/api/${action}`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      setDialog(null);
      setMenuFor(null);
      setMessage(successText);
      await loadFiles(currentPath);
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  function toggleSelectedPath(targetPath) {
    setSelectedPaths((current) => (current.includes(targetPath) ? current.filter((item) => item !== targetPath) : [...current, targetPath]));
  }

  function toggleSelectAllVisible() {
    setSelectedPaths((current) => {
      if (allVisibleSelected) return current.filter((item) => !visibleEntries.some((entry) => entry.path === item));
      const merged = new Set(current);
      visibleEntries.forEach((entry) => merged.add(entry.path));
      return Array.from(merged);
    });
  }

  function beginClipboard(operation) {
    if (!selectedPaths.length) return;
    setClipboard({ operation, items: selectedPaths, sourcePath: currentPath });
    setMessage(`${selectedPaths.length} item${selectedPaths.length === 1 ? "" : "s"} ready to ${operation === "cut" ? "move" : "copy"}`);
  }

  async function pasteClipboard() {
    if (!clipboard?.items?.length) return;
    await runAction(
      "paste",
      { operation: clipboard.operation, items: clipboard.items, destination: currentPath },
      `${clipboard.items.length} item${clipboard.items.length === 1 ? "" : "s"} ${clipboard.operation === "cut" ? "moved" : "copied"}`
    );
    if (clipboard.operation === "cut") setClipboard(null);
  }

  async function handleUpload(event) {
    const filesToUpload = Array.from(event.target.files || []);
    if (!filesToUpload.length) return;

    setStatus("working");
    setMessage("");

    try {
      for (const file of filesToUpload) {
        const relativePath = file.webkitRelativePath ? file.webkitRelativePath.replace(/\\/g, "/") : file.name;
        await api("/api/upload", {
          method: "POST",
          body: JSON.stringify({
            path: joinPath(currentPath, relativePath),
            content: encodeBinaryBase64(await file.arrayBuffer())
          })
        });
      }

      event.target.value = "";
      const label = filesToUpload[0]?.webkitRelativePath ? "folder item" : "file";
      setMessage(`${filesToUpload.length} ${label}${filesToUpload.length === 1 ? "" : "s"} uploaded`);
      await loadFiles(currentPath);
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  async function downloadFile(entry) {
    setStatus("working");
    setMessage("");

    try {
      const data = await api(`/api/download?path=${encodeURIComponent(entry.path)}`);
      const bytes = Uint8Array.from(atob(data.content), (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = entry.name;
      link.click();
      URL.revokeObjectURL(url);
      setStatus("ready");
      setMessage(`${entry.name} downloaded`);
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  if (session.loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">
        <Loader2 className="mb-3 animate-spin text-emerald-300" />
        <p>Opening Oracle VPS File Manager</p>
      </main>
    );
  }

  if (!session.authenticated) {
    return <LoginScreen onLogin={login} passwordConfigured={session.passwordConfigured} />;
  }

  const busy = status === "loading" || status === "working";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-400 text-slate-950">
              <HardDrive size={23} />
            </div>
            <div>
              <p className="text-sm text-slate-400">Oracle VPS</p>
              <h1 className="text-2xl font-bold tracking-normal">File Manager</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-xs text-slate-500">Protected root</p>
              <p className="max-w-[360px] truncate font-mono text-xs text-slate-300">{session.fileRoot}</p>
            </div>
            <button className="icon-button" type="button" aria-label="Log out" title="Log out" onClick={logout}>
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <ShieldCheck size={17} className="text-emerald-300" />
                Hosted on the VPS
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                This server reads files directly from the configured root. No private SSH key is needed on the VPS.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <QuickStat label="Folders" value={folders} />
              <QuickStat label="Files" value={files} />
              <QuickStat label="Shown size" value={formatBytes(totalSize)} />
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-300">Quick paths</p>
              <div className="space-y-2">
                {["/", "/www", "/logs", "/tmp"].map((path) => (
                  <button
                    key={path}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
                    onClick={() => loadFiles(path)}
                    type="button"
                  >
                    <Folder size={16} className="text-sky-300" />
                    <span className="min-w-0 truncate">{path}</span>
                  </button>
                ))}
              </div>
            </div>

            <button className="storage-launcher" type="button" onClick={loadStorage}>
              <div className="flex items-center gap-3">
                <div className="storage-launcher__icon">
                  <Database size={18} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-100">Storage</p>
                  <p className="text-xs text-slate-400">Projects, images, videos, documents</p>
                </div>
              </div>
              <Smartphone className="text-slate-400" size={18} />
            </button>

          </aside>

          {activeView === "storage" ? (
            <section className="min-w-0 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:p-5">
              <div className="mb-5 flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-400">Storage</p>
                  <h2 className="text-2xl font-bold">Project usage dashboard</h2>
                </div>
                <div className="flex gap-2">
                  <CommandButton icon={RefreshCcw} label="Refresh" onClick={loadStorage} />
                  <CommandButton icon={Home} label="Home" onClick={() => setActiveView("files")} />
                </div>
              </div>
              <StorageDialogContent storage={storage} />
            </section>
          ) : (
            <section className="min-w-0 rounded-lg border border-slate-800 bg-slate-900">
              <Toolbar
                currentPath={currentPath}
                query={query}
                setQuery={setQuery}
                busy={busy}
                selectedCount={selectedPaths.length}
                hasClipboard={Boolean(clipboard?.items?.length)}
                clipboardOperation={clipboard?.operation}
                onBack={() => loadFiles(parentPath(currentPath))}
                onHome={() => loadFiles("/")}
                onRefresh={() => loadFiles(currentPath)}
                onUpload={() => fileInputRef.current?.click()}
                onUploadFolder={() => folderInputRef.current?.click()}
                onNewFolder={() => setDialog({ type: "folder" })}
                onNewFile={() => setDialog({ type: "file" })}
                onCopy={() => beginClipboard("copy")}
                onCut={() => beginClipboard("cut")}
                onPaste={pasteClipboard}
                onClearSelection={() => setSelectedPaths([])}
                onDeleteSelection={() => setDialog({ type: "bulkDelete", paths: selectedPaths })}
              />

              <input ref={fileInputRef} className="hidden" type="file" multiple onChange={handleUpload} />
              <input ref={folderInputRef} className="hidden" type="file" multiple webkitdirectory="" onChange={handleUpload} />

              {message && (
                <div className={`mx-4 mt-4 rounded-lg border px-4 py-3 text-sm ${status === "error" ? "border-rose-400/30 bg-rose-950/40 text-rose-100" : "border-emerald-400/25 bg-emerald-950/30 text-emerald-100"}`}>
                  {message}
                </div>
              )}

              <PathCrumbs path={currentPath} onOpen={loadFiles} />

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-t border-slate-800 text-left">
                  <thead className="bg-slate-950/55 text-xs uppercase tracking-normal text-slate-500">
                    <tr>
                      <th className="w-14 px-4 py-3 font-semibold">
                        <label className="flex items-center justify-center">
                          <input className="selection-checkbox" type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Select all visible items" />
                        </label>
                      </th>
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Size</th>
                      <th className="px-4 py-3 font-semibold">Modified</th>
                      <th className="px-4 py-3 font-semibold">Permissions</th>
                      <th className="w-16 px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {busy && !entries.length ? (
                      <tr>
                        <td className="px-4 py-16 text-center text-slate-400" colSpan="6">
                          <Loader2 className="mx-auto mb-3 animate-spin text-emerald-300" />
                          Loading files
                        </td>
                      </tr>
                    ) : visibleEntries.length ? (
                      visibleEntries.map((entry) => (
                        <FileRow
                          key={entry.path}
                          entry={entry}
                          selected={selected?.path === entry.path}
                          checked={selectedPaths.includes(entry.path)}
                          menuOpen={menuFor === entry.path}
                          onSelect={() => setSelected(entry)}
                          onToggleCheck={() => toggleSelectedPath(entry.path)}
                          onOpen={() => (entry.type === "directory" ? loadFiles(entry.path) : setDialog({ type: "edit", entry }))}
                          onMenu={() => setMenuFor(menuFor === entry.path ? null : entry.path)}
                          onInfo={() => setDialog({ type: "info", entry })}
                          onRename={() => setDialog({ type: "rename", entry })}
                          onDelete={() => setDialog({ type: "delete", entry })}
                          onDownload={() => downloadFile(entry)}
                        />
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-16 text-center text-slate-400" colSpan="6">
                          No files found in this folder.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      </div>

      {dialog && (
        <FileDialog
          dialog={dialog}
          currentPath={currentPath}
          bulkCount={dialog.paths?.length || 0}
          onClose={() => setDialog(null)}
          onCreateFolder={(name) => runAction("mkdir", { path: joinPath(currentPath, name) }, "Folder created")}
          onCreateFile={(name, content) => runAction("save", { path: joinPath(currentPath, name), content: encodeTextBase64(content) }, "File created")}
          onRename={(entry, name) => runAction("rename", { from: entry.path, to: joinPath(parentPath(entry.path), name) }, "Item renamed")}
          onDelete={(entry) => runAction("delete", { path: entry.path }, "Item deleted")}
          onDeleteBulk={(paths) => runAction("delete-bulk", { paths }, `${paths.length} item${paths.length === 1 ? "" : "s"} deleted`)}
          onSaveComment={(entry, comment) => runAction("comment", { path: entry.path, comment }, "Note saved")}
          onSaveFile={(entry, content) => runAction("save", { path: entry.path, content: encodeTextBase64(content) }, "File saved")}
        />
      )}
    </main>
  );
}

function LoginScreen({ onLogin, passwordConfigured }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await onLogin(username, password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <form className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl" onSubmit={submit}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-400 text-slate-950">
            <Server size={22} />
          </div>
          <div>
            <p className="text-sm text-slate-400">Oracle VPS</p>
            <h1 className="text-2xl font-bold">File Manager</h1>
          </div>
        </div>

        {!passwordConfigured && (
          <div className="mb-4 flex gap-2 rounded-lg border border-amber-300/30 bg-amber-950/40 p-3 text-sm text-amber-100">
            <AlertTriangle size={18} className="shrink-0" />
            <span>Set ADMIN_PASSWORD on the server before logging in.</span>
          </div>
        )}

        {error && (
          <div className="mb-4 flex gap-2 rounded-lg border border-rose-400/30 bg-rose-950/40 p-3 text-sm text-rose-100">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <label className="block">
          <span className="mb-2 block text-sm text-slate-400">Username</span>
          <input className="control w-full" value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm text-slate-400">Password</span>
          <div className="relative">
            <input className="control w-full pr-12" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100" type="button" aria-label="Toggle password" title="Toggle password" onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>

        <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50" disabled={loading || !passwordConfigured}>
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}
          Sign in
        </button>
      </form>
    </main>
  );
}

function Toolbar({
  currentPath,
  query,
  setQuery,
  busy,
  selectedCount,
  hasClipboard,
  clipboardOperation,
  onBack,
  onHome,
  onRefresh,
  onUpload,
  onUploadFolder,
  onNewFolder,
  onNewFile,
  onCopy,
  onCut,
  onPaste,
  onClearSelection,
  onDeleteSelection
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton title="Back" icon={ArrowLeft} onClick={onBack} />
          <IconButton title="Home" icon={Home} onClick={onHome} />
          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-300">
            <span className="block truncate">{currentPath}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <IconButton title="Refresh" icon={busy ? Loader2 : RefreshCcw} onClick={onRefresh} spin={busy} />
          <CommandButton icon={Upload} label="Upload" onClick={onUpload} />
          <CommandButton icon={Folder} label="Folder Upload" onClick={onUploadFolder} />
          <CommandButton icon={FolderPlus} label="Folder" onClick={onNewFolder} />
          <CommandButton icon={FilePlus2} label="File" onClick={onNewFile} />
        </div>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input className="control w-full pl-10" placeholder="Search in this folder" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>

      {(selectedCount > 0 || hasClipboard) && (
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-400/20 bg-emerald-950/20 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm text-slate-200">
            {selectedCount > 0 ? `${selectedCount} item${selectedCount === 1 ? "" : "s"} selected` : `Clipboard ready for ${clipboardOperation === "cut" ? "move" : "copy"}`}
          </div>
          <div className="flex flex-wrap gap-2">
            <CommandButton icon={Copy} label="Copy" onClick={onCopy} disabled={!selectedCount} />
            <CommandButton icon={Scissors} label="Cut" onClick={onCut} disabled={!selectedCount} />
            <CommandButton icon={ClipboardPasteIcon} label="Paste Here" onClick={onPaste} disabled={!hasClipboard} />
            <CommandButton icon={Trash2} label="Delete" onClick={onDeleteSelection} disabled={!selectedCount} danger />
            <CommandButton icon={X} label="Clear" onClick={onClearSelection} disabled={!selectedCount} />
          </div>
        </div>
      )}
    </div>
  );
}

function PathCrumbs({ path, onOpen }) {
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ label: "/", path: "/" }, ...parts.map((part, index) => ({ label: part, path: `/${parts.slice(0, index + 1).join("/")}` }))];

  return (
    <div className="flex flex-wrap items-center gap-1 px-4 pb-4 text-sm text-slate-400">
      {crumbs.map((crumb, index) => (
        <React.Fragment key={crumb.path}>
          {index > 0 && <ChevronRight size={15} />}
          <button className="rounded-md px-2 py-1 hover:bg-slate-800 hover:text-slate-100" type="button" onClick={() => onOpen(crumb.path)}>
            {crumb.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function FileRow({ entry, selected, checked, menuOpen, onSelect, onToggleCheck, onOpen, onMenu, onInfo, onRename, onDelete, onDownload }) {
  const Icon = entry.type === "directory" ? Folder : File;

  return (
    <tr className={`border-t border-slate-800 text-sm hover:bg-slate-800/60 ${selected ? "bg-slate-800" : ""}`} onClick={onSelect}>
      <td className="px-4 py-3">
        <label className="flex items-center justify-center">
          <input
            className="selection-checkbox"
            type="checkbox"
            checked={checked}
            onChange={onToggleCheck}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${entry.name}`}
          />
        </label>
      </td>
      <td className="max-w-[360px] px-4 py-3">
        <button className="flex min-w-0 items-center gap-3 text-left" type="button" onClick={onOpen}>
          <Icon size={20} className={entry.type === "directory" ? "shrink-0 text-sky-300" : "shrink-0 text-slate-400"} />
          <span className="truncate font-medium text-slate-100">{entry.name}</span>
        </button>
      </td>
      <td className="px-4 py-3 text-slate-400">{entry.type === "directory" ? "-" : formatBytes(entry.size)}</td>
      <td className="px-4 py-3 text-slate-400">{entry.modified}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">{entry.mode}</td>
      <td className="relative px-4 py-3">
        <button className="icon-button" type="button" aria-label="Actions" title="Actions" onClick={(event) => { event.stopPropagation(); onMenu(); }}>
          <MoreVertical size={17} />
        </button>
        {menuOpen && (
          <div className="absolute right-4 top-11 z-20 w-44 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-2xl">
            <MenuItem icon={Info} label="Info" onClick={onInfo} />
            {entry.type === "file" && <MenuItem icon={Download} label="Download" onClick={onDownload} />}
            {entry.type === "file" && <MenuItem icon={Edit3} label="Edit" onClick={onOpen} />}
            <MenuItem icon={Edit3} label="Rename" onClick={onRename} />
            <MenuItem icon={Trash2} label="Delete" danger onClick={onDelete} />
          </div>
        )}
      </td>
    </tr>
  );
}

function FileDialog({ dialog, currentPath, bulkCount, onClose, onCreateFolder, onCreateFile, onRename, onDelete, onDeleteBulk, onSaveComment, onSaveFile }) {
  const [name, setName] = useState(dialog.entry?.name || "");
  const [content, setContent] = useState("");
  const [details, setDetails] = useState(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(dialog.type === "edit");
  const [error, setError] = useState("");

  useEffect(() => {
    if (dialog.type !== "edit") return;

    api(`/api/read?path=${encodeURIComponent(dialog.entry.path)}`)
      .then((data) => setContent(decodeTextBase64(data.content)))
      .catch((readError) => setError(readError.message))
      .finally(() => setLoading(false));
  }, [dialog]);

  useEffect(() => {
    if (dialog.type !== "info") return;

    setLoading(true);
    setError("");
    setDetails(null);

    api(`/api/details?path=${encodeURIComponent(dialog.entry.path)}`)
      .then((data) => {
        setDetails(data);
        setComment(data.comment || "");
      })
      .catch((detailsError) => setError(detailsError.message))
      .finally(() => setLoading(false));
  }, [dialog]);

  const titles = {
    folder: "New folder",
    file: "New file",
    rename: "Rename item",
    delete: "Delete item",
    bulkDelete: "Delete selected items",
    edit: `Edit ${dialog.entry?.name || "file"}`,
    info: `Details for ${dialog.entry?.name || "item"}`
  };

  function submit(event) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (dialog.type === "folder" && trimmedName) onCreateFolder(trimmedName);
    if (dialog.type === "file" && trimmedName) onCreateFile(trimmedName, content);
    if (dialog.type === "rename" && trimmedName) onRename(dialog.entry, trimmedName);
    if (dialog.type === "delete") onDelete(dialog.entry);
    if (dialog.type === "bulkDelete") onDeleteBulk(dialog.paths);
    if (dialog.type === "info") onSaveComment(dialog.entry, comment);
    if (dialog.type === "edit") onSaveFile(dialog.entry, content);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4">
      <form className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl" onSubmit={submit}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{titles[dialog.type]}</h2>
          <button className="icon-button" type="button" aria-label="Close" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-950/40 p-3 text-sm text-rose-100">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {dialog.type === "delete" ? (
          <p className="text-sm leading-6 text-slate-300">
            Delete <span className="font-semibold text-rose-200">{dialog.entry.name}</span> from <span className="font-mono text-slate-400">{parentPath(dialog.entry.path)}</span>?
          </p>
        ) : dialog.type === "bulkDelete" ? (
          <p className="text-sm leading-6 text-slate-300">
            Delete <span className="font-semibold text-rose-200">{bulkCount}</span> selected item{bulkCount === 1 ? "" : "s"} from <span className="font-mono text-slate-400">{currentPath}</span>?
          </p>
        ) : dialog.type === "info" ? (
          loading ? (
            <div className="flex h-64 items-center justify-center text-slate-400">
              <Loader2 className="mr-2 animate-spin" size={18} />
              Loading details
            </div>
          ) : (
            <div className="space-y-4">
              <DetailRow label="Type" value={details?.type || ""} />
              <DetailRow label="Size" value={formatBytes(details?.size || 0)} />
              <DetailRow label="Location" value={details?.location || "/"} mono />
              <DetailRow label="Path" value={details?.path || ""} mono />
              <DetailRow label="Modified" value={details?.modified || ""} />
              <DetailRow label="Last Used" value={details?.lastUsed || ""} />
              <DetailRow label="Created Date" value={details?.created || ""} />
              <label className="block">
                <span className="mb-2 block text-sm text-slate-400">Comment</span>
                <textarea
                  className="min-h-32 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:border-emerald-300"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add a note for this file or folder"
                />
              </label>
            </div>
          )
        ) : dialog.type === "edit" ? (
          loading ? (
            <div className="flex h-64 items-center justify-center text-slate-400">
              <Loader2 className="mr-2 animate-spin" size={18} />
              Loading file
            </div>
          ) : (
            <textarea className="min-h-[360px] w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-100 outline-none focus:border-emerald-300" value={content} onChange={(event) => setContent(event.target.value)} />
          )
        ) : (
          <>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">Name</span>
              <input className="control w-full" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </label>
            {dialog.type === "file" && (
              <label className="mt-4 block">
                <span className="mb-2 block text-sm text-slate-400">Content</span>
                <textarea className="min-h-44 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-100 outline-none focus:border-emerald-300" value={content} onChange={(event) => setContent(event.target.value)} />
              </label>
            )}
            <p className="mt-3 font-mono text-xs text-slate-500">{currentPath}</p>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${dialog.type === "delete" || dialog.type === "bulkDelete" ? "bg-rose-400 text-slate-950" : "bg-emerald-400 text-slate-950"}`} type="submit">
            {dialog.type === "edit" || dialog.type === "info" ? <Save size={17} /> : dialog.type === "delete" || dialog.type === "bulkDelete" ? <Trash2 size={17} /> : <FilePlus2 size={17} />}
            {dialog.type === "delete" || dialog.type === "bulkDelete" ? "Delete" : dialog.type === "info" ? "Save Note" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StorageDialogContent({ storage }) {
  if (!storage) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="mr-2 animate-spin" size={18} />
        Loading storage
      </div>
    );
  }

  const totalUsedByCategories = Object.values(storage.categories || {}).reduce((sum, value) => sum + value, 0);
  const totalSpace = storage.totalSpace || 0;
  const usedSpace = storage.usedSpace || 0;
  const freeSpace = Math.max(0, totalSpace - usedSpace);
  const categoryCards = [
    { name: "Documents", key: "documents", tone: "sky" },
    { name: "Images", key: "images", tone: "emerald" },
    { name: "Videos", key: "videos", tone: "amber" },
    { name: "Others", key: "others", tone: "rose" }
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {categoryCards.map((card) => (
          <article key={card.key} className={`storage-card storage-card--${card.tone}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">{card.name}</p>
              <Database size={16} className="text-slate-500" />
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-950">{formatCompactBytes(storage.categories?.[card.key] || 0)}</p>
            <p className="mt-3 text-xs text-slate-500">Inside {storage.projects?.length || 0} top-level items</p>
          </article>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Flow usage</p>
            <h3 className="mt-1 text-2xl font-bold">Using {formatCompactBytes(usedSpace)} of {formatCompactBytes(totalSpace)}</h3>
          </div>
          <p className="text-sm text-slate-500">Free space {formatCompactBytes(freeSpace)}</p>
        </div>

        <div className="mt-4 overflow-hidden rounded-full bg-slate-100">
          <div className="flex h-4 w-full">
            <StorageSegment value={storage.categories?.documents || 0} total={totalSpace} className="bg-sky-500" />
            <StorageSegment value={storage.categories?.images || 0} total={totalSpace} className="bg-emerald-500" />
            <StorageSegment value={storage.categories?.videos || 0} total={totalSpace} className="bg-amber-400" />
            <StorageSegment value={storage.categories?.others || 0} total={totalSpace} className="bg-rose-500" />
            <StorageSegment value={Math.max(0, totalSpace - totalUsedByCategories)} total={totalSpace} className="bg-slate-200" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
          <LegendDot color="bg-sky-500" label={`Documents (${formatCompactBytes(storage.categories?.documents || 0)})`} />
          <LegendDot color="bg-emerald-500" label={`Images (${formatCompactBytes(storage.categories?.images || 0)})`} />
          <LegendDot color="bg-amber-400" label={`Videos (${formatCompactBytes(storage.categories?.videos || 0)})`} />
          <LegendDot color="bg-rose-500" label={`Others (${formatCompactBytes(storage.categories?.others || 0)})`} />
          <LegendDot color="bg-slate-300" label={`Free (${formatCompactBytes(freeSpace)})`} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Projects and folders</p>
            <h3 className="mt-1 text-2xl font-bold">Largest items in this root</h3>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {storage.topProjects?.length ? (
            storage.topProjects.map((project) => (
              <div key={project.path} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900">{project.name}</p>
                    <p className="truncate text-xs text-slate-500">{project.path}</p>
                  </div>
                  <div className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
                    {formatCompactBytes(project.size)}
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(100, totalUsedByCategories ? (project.size / totalUsedByCategories) * 100 : 0)}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No project usage found.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function StorageSegment({ value, total, className }) {
  const width = total > 0 ? `${(value / total) * 100}%` : "0%";
  return <div className={className} style={{ width }} />;
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-[140px_minmax(0,1fr)]">
      <div className="text-sm font-semibold text-slate-400">{label}</div>
      <div className={`break-all text-sm text-slate-100 ${mono ? "font-mono" : ""}`}>{value || "-"}</div>
    </div>
  );
}

function QuickStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-bold text-slate-100">{value}</p>
    </div>
  );
}

function IconButton({ title, icon: Icon, onClick, spin = false }) {
  return (
    <button className="icon-button" type="button" aria-label={title} title={title} onClick={onClick}>
      <Icon className={spin ? "animate-spin" : ""} size={18} />
    </button>
  );
}

function CommandButton({ icon: Icon, label, onClick, disabled = false, danger = false }) {
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

function ClipboardPasteIcon(props) {
  return <Save {...props} />;
}

function MenuItem({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${danger ? "text-rose-200 hover:bg-rose-950/60" : "text-slate-200 hover:bg-slate-800"}`} type="button" onClick={onClick}>
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

createRoot(document.getElementById("root")).render(<App />);
