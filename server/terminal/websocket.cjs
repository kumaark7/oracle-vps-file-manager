const { WebSocketServer } = require("ws");
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

function attachTerminalWebSocket(httpServer, options = {}) {
  const manager = options.manager || new TerminalManager(options);
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxMessageBytes || config.terminalMaxMessageBytes,
    perMessageDeflate: false
  });

  const upgrade = (req, socket, head) => {
    let requestUrl;
    try {
      requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    } catch {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }
    if (requestUrl.pathname !== "/api/terminal" || requestUrl.search) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    if (!originAllowed(req)) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    const sessionId = verifySessionId(req);
    if (!sessionId) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }

    webSocketServer.handleUpgrade(req, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, req, sessionId);
    });
  };

  webSocketServer.on("connection", (socket, req, sessionId) => manager.accept(socket, sessionId));
  httpServer.on("upgrade", upgrade);
  httpServer.on("close", () => {
    manager.close();
    webSocketServer.close();
  });
  return { manager, webSocketServer };
}

module.exports = { attachTerminalWebSocket, expectedOrigin, originAllowed, rejectUpgrade };

