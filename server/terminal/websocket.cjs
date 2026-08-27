const { WebSocket, WebSocketServer } = require("ws");
const config = require("../config.cjs");
const { requestIsSecure } = require("../http.cjs");
const { verifySessionId } = require("../auth/sessions.cjs");
const { TerminalManager } = require("./manager.cjs");

function expectedOrigin(req) {
  const host = String(req.headers.host || "").trim();
  if (!host || /[\r\n]/.test(host)) return null;
  return `${requestIsSecure(req, config.trustProxy) ? "https" : "http"}://${host}`;
}

function originAllowed(req) {
  const expected = expectedOrigin(req);
  const supplied = String(req.headers.origin || "");
  if (!expected || !supplied) return false;
  try {
    return new URL(supplied).origin === expected;
  } catch {
    return false;
  }
}

function rejectUpgrade(socket, status, message) {
  if (!socket.writable) return socket.destroy();
  const body = `${message}\n`;
  socket.end(
    `HTTP/1.1 ${status} ${message}\r\n` +
    "Connection: close\r\n" +
    "Content-Type: text/plain; charset=utf-8\r\n" +
    `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
  );
}

function logLifecycle(logger, level, message, details) {
  const write = logger?.[level] || logger?.info;
  if (typeof write !== "function") return;
  if (details === undefined) write.call(logger, message);
  else write.call(logger, message, details);
}

function markWebSocketAlive(socket) {
  socket.isAlive = true;
  socket.on("pong", () => { socket.isAlive = true; });
}

function heartbeatSweep(webSocketServer, logger = console) {
  for (const socket of webSocketServer.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (socket.isAlive === false) {
      logLifecycle(logger, "warn", "terminal websocket heartbeat failed");
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    try {
      socket.ping();
    } catch {
      socket.terminate();
    }
  }
}

function startHeartbeat(webSocketServer, intervalMs, logger = console) {
  webSocketServer.on("connection", markWebSocketAlive);
  const timer = setInterval(() => heartbeatSweep(webSocketServer, logger), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

function attachTerminalWebSocket(httpServer, options = {}) {
  const logger = options.logger || console;
  const manager = options.manager || new TerminalManager(options);
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxMessageBytes || config.terminalMaxMessageBytes,
    perMessageDeflate: false
  });
  const stopHeartbeat = startHeartbeat(
    webSocketServer,
    options.heartbeatMs || config.terminalHeartbeatMs,
    logger
  );

  const upgrade = (req, socket, head) => {
    logLifecycle(logger, "info", "terminal websocket upgrade requested");
    let requestUrl;
    try {
      requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    } catch {
      logLifecycle(logger, "warn", "terminal websocket upgrade rejected", { status: 400, reason: "invalid request URL" });
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }
    if (requestUrl.pathname !== "/api/terminal" || requestUrl.search) {
      logLifecycle(logger, "warn", "terminal websocket upgrade rejected", { status: 404, reason: "invalid endpoint" });
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    if (!originAllowed(req)) {
      logLifecycle(logger, "warn", "terminal websocket upgrade rejected", { status: 403, reason: "invalid origin" });
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    const sessionId = verifySessionId(req);
    if (!sessionId) {
      logLifecycle(logger, "warn", "terminal websocket upgrade rejected", { status: 401, reason: "invalid session" });
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }

    webSocketServer.handleUpgrade(req, socket, head, (webSocket) => {
      logLifecycle(logger, "info", "terminal websocket accepted");
      webSocketServer.emit("connection", webSocket, req, sessionId);
    });
  };

  webSocketServer.on("connection", (socket, req, sessionId) => manager.accept(socket, sessionId));
  httpServer.on("upgrade", upgrade);
  httpServer.on("close", () => {
    stopHeartbeat();
    manager.close();
    webSocketServer.close();
  });
  logLifecycle(logger, "info", "terminal websocket handler attached", { path: "/api/terminal" });
  return { manager, webSocketServer };
}

module.exports = {
  attachTerminalWebSocket,
  expectedOrigin,
  heartbeatSweep,
  markWebSocketAlive,
  originAllowed,
  rejectUpgrade,
  startHeartbeat
};
