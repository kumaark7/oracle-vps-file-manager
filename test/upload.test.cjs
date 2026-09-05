const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ovfm-upload-"));
process.env.FILE_ROOT = root;
process.env.OVFM_SERVERS_PATH = path.join(root, "servers.json");
process.env.OVFM_AUTH_DIR = path.join(root, "auth");
process.env.PORT = "49183";
process.env.HOST = "127.0.0.1";
process.env.SESSION_SECRET = "upload-test-session-secret-32-bytes-minimum";
process.env.PASSWORD_USER = "upload-test";
process.env.ADMIN_PASSWORD = "upload-test-password";
process.env.MAX_UPLOAD_BYTES = "8";
process.env.MAX_LARGE_UPLOAD_BYTES = "20";
process.env.TRUST_PROXY = "false";

const { startValidatedServer } = require("../server/index.cjs");

const origin = `http://127.0.0.1:${process.env.PORT}`;
let server;
let cookie;

async function postJson(pathname, body, requestCookie = cookie) {
  return fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(requestCookie ? { Cookie: requestCookie } : {})
    },
    body: JSON.stringify(body)
  });
}

async function upload(remotePath, body, token = "", declaredSize = body.length) {
  return fetch(`${origin}/api/upload?serverId=local&path=${encodeURIComponent(remotePath)}`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/octet-stream",
      "X-OVFM-Upload-Size": String(declaredSize),
      ...(token ? { "X-OVFM-Upload-Authorization": token } : {})
    },
    body
  });
}

async function authorize(uploads, password = process.env.ADMIN_PASSWORD) {
  const response = await postJson("/api/upload/authorize", { password, uploads });
  return { response, payload: await response.json() };
}

test.before(async () => {
  await fsp.writeFile(process.env.OVFM_SERVERS_PATH, JSON.stringify({ servers: [] }), "utf8");
  server = await startValidatedServer();
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  const response = await postJson("/api/login", {
    username: process.env.PASSWORD_USER,
    password: process.env.ADMIN_PASSWORD
  }, "");
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie").split(";", 1)[0];
});

test.after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await fsp.rm(root, { recursive: true, force: true });
});

test("allows ordinary uploads at the standard limit", async () => {
  const response = await upload("/small.txt", Buffer.from("12345678"));
  assert.equal(response.status, 200);
  assert.equal(await fsp.readFile(path.join(root, "small.txt"), "utf8"), "12345678");
});

test("requires an authenticated session and the account password for large-upload approval", async () => {
  const uploads = [{ serverId: "local", path: "/large.txt", size: 9 }];
  const unauthenticated = await postJson("/api/upload/authorize", { password: process.env.ADMIN_PASSWORD, uploads }, "");
  assert.equal(unauthenticated.status, 401);
  const invalid = await authorize(uploads, "wrong-password");
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.payload.error, "Invalid password");
});

test("authorizes one exact large upload and rejects token reuse", async () => {
  const uploads = [{ serverId: "local", path: "/large.txt", size: 9 }];
  const unauthorized = await upload("/large.txt", Buffer.from("123456789"));
  assert.equal(unauthorized.status, 403);

  const authorization = await authorize(uploads);
  assert.equal(authorization.response.status, 200);
  assert.equal(authorization.payload.tokens.length, 1);
  const accepted = await upload("/large.txt", Buffer.from("123456789"), authorization.payload.tokens[0]);
  assert.equal(accepted.status, 200);

  const reused = await upload("/large.txt", Buffer.from("123456789"), authorization.payload.tokens[0]);
  assert.equal(reused.status, 403);
});

test("binds approval to destination and exact size", async () => {
  const authorization = await authorize([{ serverId: "local", path: "/bound.txt", size: 9 }]);
  const wrongPath = await upload("/other.txt", Buffer.from("123456789"), authorization.payload.tokens[0]);
  assert.equal(wrongPath.status, 403);

  const second = await authorize([{ serverId: "local", path: "/bound.txt", size: 9 }]);
  const wrongSize = await upload("/bound.txt", Buffer.from("1234567890"), second.payload.tokens[0], 9);
  assert.equal(wrongSize.status, 400);
});

test("rejects unknown servers and malformed destination paths", async () => {
  const unknownServer = await authorize([{ serverId: "missing", path: "/large.txt", size: 9 }]);
  assert.equal(unknownServer.response.status, 404);

  const relativePath = await authorize([{ serverId: "local", path: "large.txt", size: 9 }]);
  assert.equal(relativePath.response.status, 400);
  assert.equal(relativePath.payload.error, "Large upload selection is invalid");
});

test("enforces the hard maximum before streaming", async () => {
  const response = await upload("/too-large.txt", Buffer.alloc(21), "", 21);
  assert.equal(response.status, 413);
  assert.equal(fs.existsSync(path.join(root, "too-large.txt")), false);
});
