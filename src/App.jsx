import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiPath, downloadUrl, folderDownloadUrl, requestJson, saveText, uploadBody } from "./api/client.js";
import { LoginScreen } from "./components/LoginScreen.jsx";
import { ServerSelector } from "./components/ServerSelector.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { FileBrowser } from "./features/files/FileBrowser.jsx";
import { FileDialog } from "./features/files/FileDialog.jsx";
import { cmdPathCommand, joinPath, parentPath, sortedEntries, sshPathCommand } from "./features/files/fileUtils.js";
import { Storage } from "./features/storage/Storage.jsx";
import { useServers } from "./hooks/useServers.js";
import { useSession } from "./hooks/useSession.js";

function emptyServerState() {
  return {
    initialized: false,
    currentRoot: "",
    activeView: "files",
    currentPath: "/",
    entries: [],
    query: "",
    selected: null,
    selectedPaths: [],
    clipboard: null,
    storage: null,
    status: "idle",
    message: "",
    menuFor: null
  };
}

export default function App() {
  const { session, sessionError, login, logout } = useSession();
  const { servers, currentServerId, setCurrentServerId, serversError } = useServers(session.authenticated, session.defaultServerId);
  const [serverStates, setServerStates] = useState({});
  const [dialog, setDialog] = useState(null);
  const currentServer = useMemo(() => servers.find((server) => server.id === currentServerId) || servers[0] || null, [servers, currentServerId]);
  const currentState = serverStates[currentServerId] || emptyServerState();
  const visibleEntries = useMemo(() => sortedEntries(currentState.entries, currentState.query), [currentState.entries, currentState.query]);
  const allVisibleSelected = visibleEntries.length > 0 && visibleEntries.every((entry) => currentState.selectedPaths.includes(entry.path));

  function updateServerState(serverId, update) {
    setServerStates((current) => {
      const previous = current[serverId] || emptyServerState();
      const next = typeof update === "function" ? update(previous) : { ...previous, ...update };
      return { ...current, [serverId]: next };
    });
  }

  async function loadFiles(targetPath = currentState.currentPath, serverId = currentServerId, successMessage = "") {
    if (!serverId) return;
    updateServerState(serverId, { status: "loading", message: "", selected: null, selectedPaths: [], activeView: "files", menuFor: null });
    try {
      const data = await requestJson(apiPath("/api/files", serverId, { path: targetPath }));
      updateServerState(serverId, {
        initialized: true,
        entries: data.entries || [],
        currentPath: data.path,
        currentRoot: data.root || "",
        status: "ready",
        message: successMessage
      });
    } catch (error) {
      updateServerState(serverId, { initialized: true, status: "error", message: error.message });
      if (error.status === 401) await logout();
    }
  }

  useEffect(() => {
    if (!session.authenticated || !currentServerId || !servers.some((server) => server.id === currentServerId)) return;
    if (!(serverStates[currentServerId]?.initialized)) loadFiles(serverStates[currentServerId]?.currentPath || "/", currentServerId);
  }, [session.authenticated, currentServerId, servers]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  async function handleLogout() {
    await logout();
    setServerStates({});
    setDialog(null);
  }

  async function loadStorage(serverId = currentServerId) {
    updateServerState(serverId, { status: "working", message: "" });
    try {
      const storage = await requestJson(apiPath("/api/storage", serverId));
      updateServerState(serverId, { storage, activeView: "storage", status: "ready" });
    } catch (error) {
      updateServerState(serverId, { status: "error", message: error.message });
    }
  }

  async function runAction(action, body, successText) {
    const serverId = currentServerId;
    const pathAtStart = currentState.currentPath;
    updateServerState(serverId, { status: "working", message: "" });
    try {
      await requestJson(apiPath(`/api/${action}`, serverId), { method: "POST", body: JSON.stringify(body) });
      setDialog(null);
      await loadFiles(pathAtStart, serverId, successText);
      if (action === "paste" && body.operation === "cut") updateServerState(serverId, { clipboard: null });
    } catch (error) {
      updateServerState(serverId, { status: "error", message: error.message });
    }
  }

  async function saveFile(remotePath, content, successText) {
    const serverId = currentServerId;
    const pathAtStart = currentState.currentPath;
    updateServerState(serverId, { status: "working", message: "" });
    try {
      await saveText(serverId, remotePath, content);
      setDialog(null);
      await loadFiles(pathAtStart, serverId, successText);
    } catch (error) {
      updateServerState(serverId, { status: "error", message: error.message });
    }
  }

  async function handleUpload(event) {
    const serverId = currentServerId;
    const pathAtStart = currentState.currentPath;
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    updateServerState(serverId, { status: "working", message: "" });
    try {
      for (const file of files) {
        const relativePath = file.webkitRelativePath ? file.webkitRelativePath.replace(/\\/g, "/") : file.name;
        await uploadBody(serverId, joinPath(pathAtStart, relativePath), file);
      }
      const label = files[0]?.webkitRelativePath ? "folder item" : "file";
      await loadFiles(pathAtStart, serverId, `${files.length} ${label}${files.length === 1 ? "" : "s"} uploaded`);
    } catch (error) {
      updateServerState(serverId, { status: "error", message: error.message });
    } finally {
      event.target.value = "";
    }
  }

  function download(entry) {
    const link = document.createElement("a");
    link.href = entry.type === "directory" ? folderDownloadUrl(currentServerId, entry.path) : downloadUrl(currentServerId, entry.path);
    link.download = entry.type === "directory" ? `${entry.name}.zip` : entry.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    updateServerState(currentServerId, { message: `${entry.name} download started`, status: "ready", menuFor: null });
  }

  async function zipFolder(entry) {
    const serverId = currentServerId;
    const pathAtStart = currentState.currentPath;
    updateServerState(serverId, { status: "working", message: "", menuFor: null });
    try {
      const result = await requestJson(apiPath("/api/zip", serverId), { method: "POST", body: JSON.stringify({ path: entry.path }) });
      await loadFiles(pathAtStart, serverId, `${result.name} created`);
    } catch (error) {
      updateServerState(serverId, { status: "error", message: error.message });
    }
  }

  async function copyPathCommand(kind) {
    const rootPath = currentState.currentRoot || currentServer?.rootPath || "/";
    const command = kind === "ssh"
      ? sshPathCommand(rootPath, currentState.currentPath)
      : cmdPathCommand(currentServer, rootPath, currentState.currentPath);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is not available");
      await navigator.clipboard.writeText(command);
      updateServerState(currentServerId, { status: "ready", message: kind === "ssh" ? "SSH path copied" : "CMD command copied", menuFor: null });
    } catch (error) {
      updateServerState(currentServerId, { status: "error", message: `Could not copy command: ${error.message}` });
    }
  }

  function beginClipboard(operation) {
    if (!currentState.selectedPaths.length) return;
    const count = currentState.selectedPaths.length;
    updateServerState(currentServerId, {
      clipboard: { operation, items: currentState.selectedPaths, sourcePath: currentState.currentPath },
      message: `${count} item${count === 1 ? "" : "s"} ready to ${operation === "cut" ? "move" : "copy"}`,
      status: "ready"
    });
  }

  const browserActions = {
    setQuery: (query) => updateServerState(currentServerId, { query }),
    back: () => loadFiles(parentPath(currentState.currentPath)),
    home: () => loadFiles("/"),
    copySshPath: () => copyPathCommand("ssh"),
    copyCmdPath: () => copyPathCommand("cmd"),
    refresh: () => loadFiles(currentState.currentPath),
    newFolder: () => setDialog({ type: "folder" }),
    newFile: () => setDialog({ type: "file" }),
    beginClipboard,
    paste: () => currentState.clipboard && runAction("paste", { operation: currentState.clipboard.operation, items: currentState.clipboard.items, destination: currentState.currentPath }, `${currentState.clipboard.items.length} item${currentState.clipboard.items.length === 1 ? "" : "s"} ${currentState.clipboard.operation === "cut" ? "moved" : "copied"}`),
    clearSelection: () => updateServerState(currentServerId, { selectedPaths: [] }),
    deleteSelection: () => setDialog({ type: "bulkDelete", paths: currentState.selectedPaths }),
    upload: handleUpload,
    openPath: loadFiles,
    toggleSelectAll: () => updateServerState(currentServerId, (previous) => {
      if (allVisibleSelected) return { ...previous, selectedPaths: previous.selectedPaths.filter((item) => !visibleEntries.some((entry) => entry.path === item)) };
      return { ...previous, selectedPaths: Array.from(new Set([...previous.selectedPaths, ...visibleEntries.map((entry) => entry.path)])) };
    }),
    select: (selected) => updateServerState(currentServerId, { selected }),
    toggleSelected: (targetPath) => updateServerState(currentServerId, (previous) => ({ ...previous, selectedPaths: previous.selectedPaths.includes(targetPath) ? previous.selectedPaths.filter((item) => item !== targetPath) : [...previous.selectedPaths, targetPath] })),
    openEntry: (entry) => entry.type === "directory" ? loadFiles(entry.path) : setDialog({ type: "edit", entry }),
    setMenuFor: (menuFor) => updateServerState(currentServerId, { menuFor }),
    info: (entry) => setDialog({ type: "info", entry }),
    rename: (entry) => setDialog({ type: "rename", entry }),
    zip: zipFolder,
    remove: (entry) => setDialog({ type: "delete", entry }),
    download
  };

  const dialogHandlers = {
    createFolder: (name) => runAction("mkdir", { path: joinPath(currentState.currentPath, name) }, "Folder created"),
    createFile: (name, content) => saveFile(joinPath(currentState.currentPath, name), content, "File created"),
    rename: (entry, name) => runAction("rename", { from: entry.path, to: joinPath(parentPath(entry.path), name) }, "Item renamed"),
    remove: (entry) => runAction("delete", { path: entry.path }, "Item deleted"),
    deleteBulk: (paths) => runAction("delete-bulk", { paths }, `${paths.length} item${paths.length === 1 ? "" : "s"} deleted`),
    saveComment: (entry, comment) => runAction("comment", { path: entry.path, comment }, "Note saved"),
    saveFile: (entry, content) => saveFile(entry.path, content, "File saved")
  };

  if (session.loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-200"><div className="text-center"><Loader2 className="mx-auto mb-3 animate-spin text-emerald-300" /><p>Opening Oracle VPS File Manager</p></div></main>;
  if (!session.authenticated) return <LoginScreen onLogin={login} passwordConfigured={session.passwordConfigured} initialError={sessionError} />;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <ServerSelector servers={servers} currentServer={currentServer} currentServerId={currentServerId} currentRoot={currentState.currentRoot} onChange={(serverId) => { setDialog(null); updateServerState(currentServerId, { menuFor: null }); setCurrentServerId(serverId); }} onLogout={handleLogout} />
        {serversError && <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-950/40 px-4 py-3 text-sm text-rose-100" role="alert">{serversError}</div>}
        <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Sidebar server={currentServer} entries={currentState.entries} onOpenPath={loadFiles} onOpenStorage={() => loadStorage()} />
          {currentState.activeView === "storage"
            ? <Storage server={currentServer} storage={currentState.storage} onRefresh={() => loadStorage()} onHome={() => updateServerState(currentServerId, { activeView: "files" })} />
            : <FileBrowser state={currentState} visibleEntries={visibleEntries} allVisibleSelected={allVisibleSelected} actions={browserActions} />}
        </section>
      </div>
      {dialog && <FileDialog dialog={dialog} serverId={currentServerId} currentPath={currentState.currentPath} onClose={() => setDialog(null)} handlers={dialogHandlers} />}
    </main>
  );
}
