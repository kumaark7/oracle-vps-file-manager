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

export function sortedEntries(entries, query) {
  const needle = query.trim().toLowerCase();
  const sorted = [...entries].sort((first, second) => {
    if (first.type !== second.type) return first.type === "directory" ? -1 : 1;
    return first.name.localeCompare(second.name);
  });
  return needle ? sorted.filter((entry) => entry.name.toLowerCase().includes(needle)) : sorted;
}
