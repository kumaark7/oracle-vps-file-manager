const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const config = require("./config.cjs");
const { HttpError } = require("./http.cjs");

const LOCAL_SERVER_ID = "local";

function normalizeServerId(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || null;
}

function buildLocalServer() {
  const isWindows = process.platform === "win32";
  return {
    id: LOCAL_SERVER_ID,
    name: config.localServerName || (isWindows ? "This Computer" : "Primary VPS"),
    kind: "local",
    host: config.publicHost || (isWindows ? "127.0.0.1" : "localhost"),
    port: 22,
    username: config.localServerUser || process.env.USER || process.env.USERNAME || os.userInfo().username || "user",
    rootPath: config.fileRoot,
    description: isWindows ? "Hosted locally on this computer" : "Hosted on this VPS"
  };
}

async function readConfiguredServers() {
  try {
    const parsed = JSON.parse(await fsp.readFile(config.serversPath, "utf8"));
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.servers) ? parsed.servers : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function sanitizeServer(rawServer, index) {
  if (!rawServer || typeof rawServer !== "object") throw new Error(`Invalid server configuration at index ${index}`);
  const id = normalizeServerId(rawServer.id || rawServer.name || `server-${index + 1}`);
  if (rawServer.kind === "local") throw new Error("Only the built-in local server can use kind=local");
  if (!rawServer.host || !rawServer.username || !rawServer.keyPath) {
    throw new Error(`Server ${id} must include host, username, and keyPath`);
  }
  const port = Number(rawServer.port || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Server ${id} has an invalid port`);
  return {
    id,
    name: String(rawServer.name || id),
    kind: "ssh",
    host: String(rawServer.host),
    port,
    username: String(rawServer.username),
    keyPath: path.resolve(String(rawServer.keyPath)),
    rootPath: path.posix.normalize(String(rawServer.rootPath || `/home/${rawServer.username}`)),
    description: String(rawServer.description || "Remote server managed over SSH")
  };
}

async function getServers() {
  const configured = await readConfiguredServers();
  const seen = new Set([LOCAL_SERVER_ID]);
  const remote = configured.map(sanitizeServer).map((server) => {
    if (seen.has(server.id)) throw new Error(`Duplicate server id: ${server.id}`);
    seen.add(server.id);
    return server;
  });
  return [buildLocalServer(), ...remote];
}

async function getServer(serverId) {
  const id = normalizeServerId(serverId) || LOCAL_SERVER_ID;
  const server = (await getServers()).find((item) => item.id === id);
  if (!server) throw new HttpError(404, `Unknown server: ${id}`);
  return server;
}

function publicServer(server) {
  return {
    id: server.id,
    name: server.name,
    kind: server.kind,
    host: server.host,
    port: server.port,
    username: server.username,
    rootPath: server.rootPath,
    description: server.description
  };
}

module.exports = { LOCAL_SERVER_ID, getServer, getServers, publicServer };
