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
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.servers)) {
      return parsed.servers;
    }
    throw new Error("Server configuration must be an array or an object with a servers array");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error(`Could not load server configuration: ${error.message}`);
  }
}

function requiredString(rawServer, field, index) {
  if (typeof rawServer[field] !== "string" || !rawServer[field].trim()) {
    throw new Error(`Server configuration at index ${index} must include ${field}`);
  }

  return rawServer[field].trim();
}

function sanitizeServer(rawServer, index) {
  if (!rawServer || typeof rawServer !== "object" || Array.isArray(rawServer)) {
    throw new Error(`Invalid server configuration at index ${index}`);
  }

  const configuredId = requiredString(rawServer, "id", index);
  const id = normalizeServerId(configuredId);
  if (!id) throw new Error(`Server configuration at index ${index} has an invalid id`);

  const name = requiredString(rawServer, "name", index);
  const kind = requiredString(rawServer, "kind", index).toLowerCase();
  if (kind !== "ssh") throw new Error(`Server ${id} has an invalid kind; expected ssh`);

  const host = requiredString(rawServer, "host", index);
  const username = requiredString(rawServer, "username", index);
  const keyPath = requiredString(rawServer, "keyPath", index);
  const rootPath = requiredString(rawServer, "rootPath", index);
  if (!path.posix.isAbsolute(rootPath)) {
    throw new Error(`Server ${id} rootPath must be an absolute POSIX path`);
  }

  const port = rawServer.port === undefined ? 22 : Number(rawServer.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Server ${id} has an invalid port`);

  return {
    id,
    name,
    kind,
    host,
    port,
    username,
    keyPath: path.resolve(keyPath),
    rootPath: path.posix.normalize(rootPath),
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
