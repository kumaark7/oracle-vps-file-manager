let fallbackSequence = 0;

export function createTabId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  fallbackSequence += 1;
  return `terminal-${Date.now()}-${fallbackSequence}`;
}

export function nextTabTitle(tabs, server) {
  const base = server?.name || "Server";
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(?: (\\d+))?$`);
  let highest = 0;
  for (const tab of tabs) {
    if (tab.serverId !== server.id) continue;
    const match = pattern.exec(tab.title);
    if (match) highest = Math.max(highest, match[1] ? Number(match[1]) : 1);
  }
  return highest === 0 ? base : `${base} ${highest + 1}`;
}

export function createTerminalTab(tabs, server, path = "/", idFactory = createTabId) {
  return {
    id: idFactory(),
    serverId: server.id,
    serverName: server.name,
    path: path || "/",
    title: nextTabTitle(tabs, server),
    status: { kind: "connecting", label: "Connecting..." },
    restartVersion: 0
  };
}

export function neighboringTabId(tabs, closingId) {
  const index = tabs.findIndex((tab) => tab.id === closingId);
  if (index < 0) return tabs[0]?.id || null;
  return tabs[index + 1]?.id || tabs[index - 1]?.id || null;
}

export function pathForNewTerminal(serverId, currentServerId, currentPath) {
  return serverId === currentServerId ? currentPath || "/" : "/";
}

export function restartTerminalTab(tabs, tabId) {
  return tabs.map((tab) => tab.id === tabId
    ? { ...tab, restartVersion: tab.restartVersion + 1, status: { kind: "connecting", label: "Connecting..." } }
    : tab);
}
