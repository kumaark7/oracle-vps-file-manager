const path = require("path");
const { WebSocket } = require("ws");
const config = require("../config.cjs");
const { getServer } = require("../servers.cjs");
const { getServerAdapter } = require("../adapters/index.cjs");
const { onSessionDestroyed } = require("../auth/sessions.cjs");
const { spawnLocalTerminal } = require("./local.cjs");
const { spawnSshTerminal } = require("./ssh.cjs");

const MIN_COLS = 20;
const MAX_COLS = 500;
const MIN_ROWS = 5;
const MAX_ROWS = 200;

function validDimensions(cols, rows) {
  return Number.isInteger(cols) && cols >= MIN_COLS && cols <= MAX_COLS &&
    Number.isInteger(rows) && rows >= MIN_ROWS && rows <= MAX_ROWS;
}

function parseTerminalMessage(raw, maxBytes = config.terminalMaxMessageBytes) {
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buffer.length > maxBytes) throw new Error("Terminal message is too large");
  let message;
  try {
    message = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new Error("Malformed terminal message");
  }
  if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") {
    throw new Error("Malformed terminal message");
  }
  return message;
}

function remoteStartDirectory(rootPath, virtualPath) {
  const requested = String(virtualPath || "/");
  if (requested.includes("\0") || requested.includes("\\")) throw new Error("Invalid terminal path");
  const relative = requested.startsWith("/") ? requested.slice(1) : requested;
  const root = path.posix.resolve(rootPath);
  const absolute = path.posix.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}/`)) throw new Error("Invalid terminal path");
  return absolute;
}

async function resolveStartDirectory(server, requestedPath, adapterFactory = getServerAdapter) {
  const adapter = adapterFactory(server);
  for (const candidate of [requestedPath || "/", "/"]) {
    try {
      const details = await adapter.details(candidate);
      if (details.type !== "Directory") continue;
      if (server.kind === "local") return adapter.resolveExisting(candidate);
      return remoteStartDirectory(server.rootPath, candidate);
    } catch {
      // Invalid or unavailable requested paths fall back to the configured root.
    }
  }
  throw new Error("Terminal start directory is unavailable");
}

async function spawnTerminalForServer(options) {
  return options.server.kind === "local" ? spawnLocalTerminal(options) : spawnSshTerminal(options);
}

class TerminalManager {
  constructor(options = {}) {
    this.getServer = options.getServer || getServer;
    this.adapterFactory = options.adapterFactory || getServerAdapter;
    this.spawnTerminal = options.spawnTerminal || spawnTerminalForServer;
    this.idleTimeoutMs = options.idleTimeoutMs || config.terminalIdleTimeoutMs;
    this.maxLifetimeMs = options.maxLifetimeMs || config.terminalMaxLifetimeMs;
    this.maxSessions = options.maxSessions || config.terminalMaxSessions;
    this.maxMessageBytes = options.maxMessageBytes || config.terminalMaxMessageBytes;
    this.maxBufferedBytes = options.maxBufferedBytes || config.terminalMaxBufferedBytes;
    this.active = new Set();
    this.sessionCounts = new Map();
    this.unsubscribeSession = onSessionDestroyed((sessionId) => this.closeForSession(sessionId));
  }

  accept(socket, sessionId) {
    const count = this.sessionCounts.get(sessionId) || 0;
    if (count >= this.maxSessions) {
      this.send(socket, { type: "error", message: "Terminal session limit reached" });
      socket.close(1008, "Session limit reached");
      return null;
    }

    const state = {
      socket,
      sessionId,
      pty: null,
      initialized: false,
      closed: false,
      idleTimer: null,
      lifetimeTimer: null
    };
    this.active.add(state);
    this.sessionCounts.set(sessionId, count + 1);
    this.resetIdle(state);
    state.lifetimeTimer = setTimeout(() => this.expire(state, "Terminal maximum lifetime reached"), this.maxLifetimeMs);

    socket.on("message", (raw) => { void this.handleMessage(state, raw); });
    socket.on("close", () => this.cleanup(state));
    socket.on("error", () => this.cleanup(state));
    return state;
  }

  send(socket, message) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  resetIdle(state) {
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => this.expire(state, "Terminal session expired due to inactivity"), this.idleTimeoutMs);
  }

  expire(state, message) {
    if (state.closed) return;
    this.send(state.socket, { type: "error", message });
    this.cleanup(state);
    state.socket.close(1000, "Terminal closed");
  }

  protocolError(state, message = "Invalid terminal message") {
    this.send(state.socket, { type: "error", message });
    this.cleanup(state);
    state.socket.close(1008, "Protocol error");
  }

  async handleMessage(state, raw) {
    if (state.closed) return;
    let message;
    try {
      message = parseTerminalMessage(raw, this.maxMessageBytes);
    } catch (error) {
      this.protocolError(state, error.message);
      return;
    }

    if (message.type === "init") {
      if (state.initialized || typeof message.serverId !== "string" || typeof message.path !== "string" || message.path.length > 4096 || !validDimensions(message.cols, message.rows)) {
        this.protocolError(state);
        return;
      }
      state.initialized = true;
      let server;
      try {
        server = await this.getServer(message.serverId);
        const cwd = await resolveStartDirectory(server, message.path, this.adapterFactory);
        const terminal = await this.spawnTerminal({ server, cwd, cols: message.cols, rows: message.rows });
        if (state.closed) {
          terminal.kill();
          return;
        }
        state.pty = terminal;
        terminal.onData((data) => {
          if (state.closed) return;
          this.resetIdle(state);
          if (state.socket.bufferedAmount > this.maxBufferedBytes) {
            this.expire(state, "Terminal connection is too slow");
            return;
          }
          this.send(state.socket, { type: "output", data });
        });
        terminal.onExit(({ exitCode }) => {
          if (state.closed) return;
          this.send(state.socket, { type: "exit", code: Number.isInteger(exitCode) ? exitCode : null });
          this.cleanup(state);
          state.socket.close(1000, "Terminal exited");
        });
        this.resetIdle(state);
        this.send(state.socket, { type: "ready" });
      } catch {
        this.send(state.socket, { type: "error", message: server?.kind === "ssh" ? "SSH connection failed" : "Terminal session failed to start" });
        this.cleanup(state);
        state.socket.close(1011, "Terminal start failed");
      }
      return;
    }

    if (!state.initialized || !state.pty) {
      this.protocolError(state);
      return;
    }
    if (message.type === "input" && typeof message.data === "string" && Buffer.byteLength(message.data) <= this.maxMessageBytes) {
      this.resetIdle(state);
      state.pty.write(message.data);
      return;
    }
    if (message.type === "resize" && validDimensions(message.cols, message.rows)) {
      this.resetIdle(state);
      state.pty.resize(message.cols, message.rows);
      return;
    }
    this.protocolError(state);
  }

  cleanup(state) {
    if (!state || state.closed) return;
    state.closed = true;
    clearTimeout(state.idleTimer);
    clearTimeout(state.lifetimeTimer);
    if (state.pty) {
      try { state.pty.kill(); } catch { /* The process may already have exited. */ }
      state.pty = null;
    }
    this.active.delete(state);
    const count = Math.max(0, (this.sessionCounts.get(state.sessionId) || 1) - 1);
    if (count) this.sessionCounts.set(state.sessionId, count);
    else this.sessionCounts.delete(state.sessionId);
  }

  closeForSession(sessionId) {
    for (const state of [...this.active]) {
      if (state.sessionId === sessionId) this.expire(state, "Terminal session ended");
    }
  }

  close() {
    for (const state of [...this.active]) this.expire(state, "Terminal service stopped");
    this.unsubscribeSession();
  }
}

module.exports = { TerminalManager, parseTerminalMessage, remoteStartDirectory, resolveStartDirectory, validDimensions };
