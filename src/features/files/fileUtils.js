export function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function formatCompactBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

export function joinPath(base, name) {
  return base === "/" ? `/${name}` : `${base.replace(/\/$/, "")}/${name}`;
}

export function parentPath(value) {
  if (!value || value === "/") return "/";
  const clean = value.replace(/\/$/, "");
  const index = clean.lastIndexOf("/");
  return index <= 0 ? "/" : clean.slice(0, index);
}

export function absoluteServerPath(rootPath, currentPath) {
  const root = String(rootPath || "/");
  const parts = String(currentPath || "/").split("/").filter(Boolean);
  if (/^[a-zA-Z]:[\\/]/.test(root)) {
    const cleanRoot = root.replace(/[\\/]+$/, "");
    return parts.length ? `${cleanRoot}\\${parts.join("\\")}` : cleanRoot;
  }
  const cleanRoot = root === "/" ? "" : root.replace(/\/+$/, "");
  if (!parts.length) return cleanRoot || "/";
  return `${cleanRoot}/${parts.join("/")}`;
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function sshPathCommand(rootPath, currentPath) {
  return `cd ${shellQuote(absoluteServerPath(rootPath, currentPath))}`;
}

export function cmdPathCommand(server, rootPath, currentPath) {
  const rawHost = String(server?.host || "");
  const host = rawHost.includes(":") && !rawHost.startsWith("[") ? `[${rawHost}]` : rawHost;
  const destination = `${server?.username || "ubuntu"}@${host}`;
  const destinationArgument = /[\s"&|<>^]/.test(destination) ? `"${destination.replace(/"/g, '\\"')}"` : destination;
  const remotePath = shellQuote(absoluteServerPath(rootPath, currentPath));
  return `ssh ${destinationArgument} -p ${server?.port || 22} -t "cd ${remotePath} && exec bash -l"`;
}

export function sortedEntries(entries, query) {
  const needle = query.trim().toLowerCase();
  const sorted = [...entries].sort((first, second) => {
    if (first.type !== second.type) return first.type === "directory" ? -1 : 1;
    return first.name.localeCompare(second.name);
  });
  return needle ? sorted.filter((entry) => entry.name.toLowerCase().includes(needle)) : sorted;
}
