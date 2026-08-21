const { getComment } = require("./comments.cjs");

const formatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function formatTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return formatter.format(new Date(timestamp * 1000)).replace(",", "");
}

function normalizeList(result) {
  return {
    root: result.root,
    path: result.path,
    entries: Array.isArray(result.entries)
      ? result.entries.map((entry) => ({ ...entry, modified: formatTimestamp(entry.modifiedTs) }))
      : []
  };
}

async function listFiles(adapter, remotePath) {
  return normalizeList(await adapter.list(remotePath));
}

async function getDetails(adapter, server, remotePath) {
  const result = await adapter.details(remotePath);
  return {
    name: result.name,
    type: result.type,
    size: result.size,
    location: result.location,
    path: result.path,
    modified: formatTimestamp(result.modifiedTs),
    lastUsed: formatTimestamp(result.lastUsedTs),
    created: formatTimestamp(result.createdTs),
    comment: await getComment(server.id, remotePath)
  };
}

module.exports = { getDetails, listFiles };
