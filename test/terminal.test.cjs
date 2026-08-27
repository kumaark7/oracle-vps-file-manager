const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { WebSocket } = require("ws");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ovfm-terminal-"));
const serversPath = path.join(temporaryRoot, "servers.json");
process.env.FILE_ROOT = temporaryRoot;
process.env.OVFM_SERVERS_PATH = serversPath;
process.env.OVFM_AUTH_DIR = path.join(temporaryRoot, "auth");
process.env.SESSION_SECRET = "terminal-test-session-secret-32-bytes-minimum";
process.env.PASSWORD_USER = "terminal-test";
process.env.ADMIN_PASSWORD = "terminal-test-password";
process.env.TRUST_PROXY = "true";

const { createApplicationServer } = require("../server/index.cjs");
const config = require("../server/config.cjs");
const { createSessionCookie, destroySession, verifySessionId } = require("../server/auth/sessions.cjs");
const { sanitizedTerminalEnvironment } = require("../server/terminal/local.cjs");
const {
  TerminalManager,
  parseTerminalMessage,
  remoteStartDirectory,
  resolveStartDirectory,
  validDimensions
} = require("../server/terminal/manager.cjs");
const { heartbeatSweep, markWebSocketAlive } = require("../server/terminal/websocket.cjs");

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = WebSocket.OPEN;
    this.bufferedAmount = 0;
    this.messages = [];
    this.closeCode = null;
    this.pingCount = 0;
    this.terminated = false;
  }

  send(payload) { this.messages.push(JSON.parse(payload)); }
  close(code) {
    if (this.readyState === WebSocket.CLOSED) return;
    this.closeCode = code;
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
  ping() { this.pingCount += 1; }
  terminate() {
    this.terminated = true;
    this.close(1006);
  }
}

function fakeTerminal() {
  const terminal = {
    killed: false,
    writes: [],
    resizes: [],
    dataListener: null,
    exitListener: null,
    onData(listener) { this.dataListener = listener; },
    onExit(listener) { this.exitListener = listener; },
    write(data) { this.writes.push(data); },
    resize(cols, rows) { this.resizes.push([cols, rows]); },
    kill() { this.killed = true; }
  };
  return terminal;
}

function localServer() {
  return { id: "local", kind: "local", rootPath: temporaryRoot };
}

function adapter() {
  return {
    async details(requested) {
      if (requested === "/missing") throw new Error("missing");
      return { type: "Directory" };
    },
    async resolveExisting(requested) { return path.join(temporaryRoot, requested.replace(/^\/+/, "")); }
  };
}

function init(socket, serverId = "local", requestedPath = "/") {
  socket.emit("message", Buffer.from(JSON.stringify({ type: "init", serverId, path: requestedPath, cols: 100, rows: 30 })));
}

async function waitFor(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for terminal state");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function managerOptions(overrides = {}) {
  return {
    getServer: async () => localServer(),
    adapterFactory: () => adapter(),
    spawnTerminal: async () => fakeTerminal(),
    idleTimeoutMs: 2_000,
    maxLifetimeMs: 4_000,
    logger: { info() {}, warn() {}, error() {} },
    ...overrides
  };
}

test.after(async () => {
  await fsp.rm(temporaryRoot, { recursive: true, force: true });
});

test("sanitizes the local terminal environment", () => {
  const environment = sanitizedTerminalEnvironment({
    HOME: "/home/test",
    PATH: "/usr/bin",
    LANG: "en_US.UTF-8",
    LC_TIME: "en_IN.UTF-8",
    SESSION_SECRET: "do-not-copy",
    ADMIN_PASSWORD: "do-not-copy",
    OVFM_SERVERS_PATH: "/secret/config"
  }, "linux");

  assert.equal(environment.HOME, "/home/test");
  assert.equal(environment.LC_TIME, "en_IN.UTF-8");
  assert.equal(environment.TERM, "xterm-256color");
  assert.equal(environment.SESSION_SECRET, undefined);
  assert.equal(environment.ADMIN_PASSWORD, undefined);
  assert.equal(environment.OVFM_SERVERS_PATH, undefined);
});

test("rejects an expired authenticated session", () => {
  const originalNow = Date.now;
  const startedAt = originalNow();
  const request = { headers: {}, socket: { encrypted: false, remoteAddress: "127.0.0.1" } };
  try {
    Date.now = () => startedAt;
    request.headers.cookie = createSessionCookie(request).split(";", 1)[0];
    Date.now = () => startedAt + config.sessionTtlMs + 1;
    assert.equal(verifySessionId(request), null);
  } finally {
    Date.now = originalNow;
  }
});

test("validates protocol messages, resize bounds, and remote paths", () => {
  assert.deepEqual(parseTerminalMessage(Buffer.from('{"type":"input","data":"ls\\r"}')), { type: "input", data: "ls\r" });
  assert.throws(() => parseTerminalMessage(Buffer.from("not-json")), /Malformed/);
  assert.throws(() => parseTerminalMessage(Buffer.alloc(10), 2), /too large/);
  assert.equal(validDimensions(120, 35), true);
  assert.equal(validDimensions(10, 35), false);
  assert.equal(validDimensions(120, 500), false);
  assert.equal(remoteStartDirectory("/home/ubuntu", "/projects/app"), "/home/ubuntu/projects/app");
  assert.throws(() => remoteStartDirectory("/home/ubuntu", "/../../root"), /Invalid/);
});

test("falls back to the configured root when a requested directory is unavailable", async () => {
  const resolved = await resolveStartDirectory(localServer(), "/missing", () => adapter());
  assert.equal(resolved, temporaryRoot);
});

test("rejects invalid server IDs without spawning a terminal", async () => {
  let spawned = false;
  const manager = new TerminalManager(managerOptions({
    getServer: async () => { throw new Error("unknown server"); },
    spawnTerminal: async () => { spawned = true; return fakeTerminal(); }
  }));
  const socket = new FakeSocket();
  manager.accept(socket, "session-invalid-server");
  init(socket, "does-not-exist");
  await waitFor(() => socket.readyState === WebSocket.CLOSED);
  assert.equal(spawned, false);
  assert.equal(socket.messages.at(-1).message, "Terminal session failed to start");
  manager.close();
});

test("applies resize messages and rejects malformed protocol input", async () => {
  const terminal = fakeTerminal();
  const manager = new TerminalManager(managerOptions({ spawnTerminal: async () => terminal }));
  const socket = new FakeSocket();
  manager.accept(socket, "session-resize");
  init(socket);
  await waitFor(() => socket.messages.some((message) => message.type === "ready"));
  socket.emit("message", Buffer.from(JSON.stringify({ type: "resize", cols: 140, rows: 40 })));
  assert.deepEqual(terminal.resizes, [[140, 40]]);
  socket.emit("message", Buffer.from(JSON.stringify({ type: "resize", cols: 1, rows: 1 })));
  assert.equal(socket.closeCode, 1008);
  assert.equal(terminal.killed, true);
  manager.close();
});

test("kills the terminal on disconnect and enforces a session limit", async () => {
  const terminal = fakeTerminal();
  const manager = new TerminalManager(managerOptions({ maxSessions: 1, spawnTerminal: async () => terminal }));
  const first = new FakeSocket();
  const second = new FakeSocket();
  manager.accept(first, "same-session");
  manager.accept(second, "same-session");
  assert.equal(second.closeCode, 1008);
  init(first);
  await waitFor(() => first.messages.some((message) => message.type === "ready"));
  first.close(1000);
  assert.equal(terminal.killed, true);
  assert.equal(manager.sessionCounts.has("same-session"), false);
  manager.close();
});

test("supports simultaneous terminals and closing one leaves the other alive", async () => {
  const terminals = [fakeTerminal(), fakeTerminal()];
  let index = 0;
  const manager = new TerminalManager(managerOptions({
    maxSessions: 6,
    spawnTerminal: async () => terminals[index++]
  }));
  const first = new FakeSocket();
  const second = new FakeSocket();
  manager.accept(first, "multi-session");
  manager.accept(second, "multi-session");
  init(first);
  init(second);
  await waitFor(() => first.messages.some((message) => message.type === "ready") && second.messages.some((message) => message.type === "ready"));

  first.close(1000);

  assert.equal(terminals[0].killed, true);
  assert.equal(terminals[1].killed, false);
  assert.equal(second.readyState, WebSocket.OPEN);
  assert.equal(manager.sessionCounts.get("multi-session"), 1);
  manager.close();
  assert.equal(terminals[1].killed, true);
});

test("kills terminals when the authenticated session is destroyed", async () => {
  const request = { headers: {}, socket: { encrypted: false, remoteAddress: "127.0.0.1" } };
  request.headers.cookie = createSessionCookie(request).split(";", 1)[0];
  const sessionId = verifySessionId(request);
  const terminals = [fakeTerminal(), fakeTerminal()];
  let index = 0;
  const manager = new TerminalManager(managerOptions({ spawnTerminal: async () => terminals[index++] }));
  const sockets = [new FakeSocket(), new FakeSocket()];
  for (const socket of sockets) {
    manager.accept(socket, sessionId);
    init(socket);
  }
  await waitFor(() => sockets.every((socket) => socket.messages.some((message) => message.type === "ready")));

  destroySession(request);

  assert.ok(terminals.every((terminal) => terminal.killed));
  assert.ok(sockets.every((socket) => socket.readyState === WebSocket.CLOSED));
  assert.ok(sockets.every((socket) => socket.messages.some((message) => message.message === "Terminal session ended")));
  manager.close();
});

test("WebSocket heartbeat preserves responsive clients and terminates only dead clients", () => {
  const live = new FakeSocket();
  const dead = new FakeSocket();
  markWebSocketAlive(live);
  markWebSocketAlive(dead);
  const webSocketServer = { clients: new Set([live, dead]) };

  heartbeatSweep(webSocketServer, { warn() {} });
  assert.equal(live.pingCount, 1);
  assert.equal(dead.pingCount, 1);
  live.emit("pong");

  heartbeatSweep(webSocketServer, { warn() {} });
  assert.equal(live.terminated, false);
  assert.equal(live.pingCount, 2);
  assert.equal(dead.terminated, true);
  assert.equal(live.readyState, WebSocket.OPEN);
});

test("enforces idle timeout and maximum lifetime", async () => {
  const idleManager = new TerminalManager(managerOptions({ idleTimeoutMs: 25, maxLifetimeMs: 500 }));
  const idleSocket = new FakeSocket();
  idleManager.accept(idleSocket, "idle-session");
  init(idleSocket);
  await waitFor(() => idleSocket.readyState === WebSocket.CLOSED);
  assert.ok(idleSocket.messages.some((message) => /inactivity/.test(message.message || "")));
  idleManager.close();

  const lifetimeManager = new TerminalManager(managerOptions({ idleTimeoutMs: 500, maxLifetimeMs: 25 }));
  const lifetimeSocket = new FakeSocket();
  lifetimeManager.accept(lifetimeSocket, "lifetime-session");
  init(lifetimeSocket);
  await waitFor(() => lifetimeSocket.readyState === WebSocket.CLOSED);
  assert.ok(lifetimeSocket.messages.some((message) => /maximum lifetime/.test(message.message || "")));
  lifetimeManager.close();
});

function rejectedStatus(url, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    socket.once("unexpected-response", (_request, response) => {
      const status = response.statusCode;
      response.resume();
      resolve(status);
    });
    socket.once("open", () => {
      socket.close();
      resolve(101);
    });
    socket.once("error", (error) => {
      if (!/Unexpected server response/.test(error.message)) reject(error);
    });
  });
}

test("WebSocket upgrade requires a valid session and same origin", async () => {
  await fsp.writeFile(serversPath, JSON.stringify({ servers: [] }), "utf8");
  const server = createApplicationServer({ terminalOptions: managerOptions() });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/api/terminal`;

  try {
    assert.equal(await rejectedStatus(url, { origin }), 401);
    assert.equal(await rejectedStatus(url, { origin, headers: { Cookie: "ovfm_session=invalid.invalid" } }), 401);

    const loginResponse = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: process.env.PASSWORD_USER, password: process.env.ADMIN_PASSWORD })
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie").split(";", 1)[0];

    assert.equal(await rejectedStatus(url, { origin: "https://malicious.example", headers: { Cookie: cookie } }), 403);
    assert.equal(await rejectedStatus(`${url}?token=forbidden`, { origin, headers: { Cookie: cookie } }), 404);
    assert.equal(await rejectedStatus(url, { origin, headers: { Cookie: cookie } }), 101);
    assert.equal(await rejectedStatus(url, {
      origin: "https://files.projectdarkhope.xyz",
      headers: {
        Cookie: cookie,
        Host: "files.projectdarkhope.xyz",
        "X-Forwarded-Proto": "https"
      }
    }), 101);
    assert.equal(await rejectedStatus(url, {
      origin: "https://evil.example",
      headers: {
        Cookie: cookie,
        Host: "files.projectdarkhope.xyz",
        "X-Forwarded-Proto": "https"
      }
    }), 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Nginx examples keep terminal WebSockets long-lived and scoped", async () => {
  for (const filename of ["nginx-domain.conf", "nginx-ip.conf"]) {
    const contents = await fsp.readFile(path.join(process.cwd(), "deploy", filename), "utf8");
    assert.match(contents, /location = \/api\/terminal/);
    assert.match(contents, /proxy_set_header Upgrade \$http_upgrade/);
    assert.match(contents, /proxy_read_timeout 7200s/);
    assert.match(contents, /proxy_send_timeout 7200s/);
  }
});
