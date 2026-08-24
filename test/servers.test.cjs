const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "ovfm-servers-")
);
const serversPath = path.join(temporaryRoot, "servers.json");

process.env.OVFM_SERVERS_PATH = serversPath;
process.env.PORT = "49179";
process.env.HOST = "127.0.0.1";
process.env.SESSION_SECRET = "test-only-session-secret-32-bytes-minimum";
process.env.ADMIN_USER = "server-test";
process.env.ADMIN_PASSWORD = "server-test-password";

const {
  getServers,
  publicServer
} = require("../server/servers.cjs");
const { getServerAdapter } = require("../server/adapters/index.cjs");
const { SshAdapter } = require("../server/adapters/ssh.cjs");
const { startValidatedServer } = require("../server/index.cjs");

function remote(id, overrides = {}) {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    kind: "ssh",
    host: "192.0.2.10",
    port: 22,
    username: "ubuntu",
    keyPath: path.join(temporaryRoot, `${id}.key`),
    rootPath: "/home/ubuntu",
    ...overrides
  };
}

async function writeConfiguration(servers) {
  await fsp.writeFile(
    serversPath,
    JSON.stringify({ servers }),
    "utf8"
  );
}

async function startServerForTest() {
  const server = await startValidatedServer();

  if (!server.listening) {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
  }

  return server;
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test.after(async () => {
  await fsp.rm(temporaryRoot, {
    recursive: true,
    force: true
  });
});

test("loads zero, one, and multiple remote servers", async () => {
  await writeConfiguration([]);
  assert.deepEqual((await getServers()).map((server) => server.id), ["local"]);

  await writeConfiguration([remote("dark")]);
  assert.deepEqual((await getServers()).map((server) => server.id), ["local", "dark"]);

  await writeConfiguration([
    remote("dark"),
    remote("minecraft"),
    remote("backup")
  ]);
  assert.deepEqual(
    (await getServers()).map((server) => server.id),
    ["local", "dark", "minecraft", "backup"]
  );

  await fsp.writeFile(
    serversPath,
    JSON.stringify([remote("legacy-array")]),
    "utf8"
  );
  assert.deepEqual(
    (await getServers()).map((server) => server.id),
    ["local", "legacy-array"]
  );
});

test("rejects duplicate IDs and malformed entries", async () => {
  await writeConfiguration([remote("dark"), remote("DARK")]);
  await assert.rejects(getServers(), /Duplicate server id: dark/);

  const invalidCases = [
    [{ ...remote("missing-id"), id: "" }, /must include id/],
    [{ ...remote("missing-name"), name: "" }, /must include name/],
    [{ ...remote("bad-kind"), kind: "local" }, /invalid kind/],
    [{ ...remote("missing-host"), host: "" }, /must include host/],
    [{ ...remote("bad-port"), port: 70000 }, /invalid port/],
    [{ ...remote("missing-user"), username: "" }, /must include username/],
    [{ ...remote("missing-key"), keyPath: "" }, /must include keyPath/],
    [{ ...remote("missing-root"), rootPath: "" }, /must include rootPath/],
    [{ ...remote("relative-root"), rootPath: "home/ubuntu" }, /absolute POSIX path/]
  ];

  for (const [entry, expected] of invalidCases) {
    await writeConfiguration([entry]);
    await assert.rejects(getServers(), expected);
  }

  await fsp.writeFile(serversPath, "{not-json", "utf8");
  await assert.rejects(getServers(), /Could not load server configuration/);

  await fsp.writeFile(serversPath, JSON.stringify({}), "utf8");
  await assert.rejects(getServers(), /must be an array or an object with a servers array/);
});

test("does not connect during loading and keeps key paths private", async () => {
  await writeConfiguration([
    remote("offline", {
      host: "192.0.2.254",
      keyPath: path.join(temporaryRoot, "missing.key")
    })
  ]);

  const servers = await getServers();
  const configured = servers[1];

  assert.equal(configured.id, "offline");
  assert.equal(getServerAdapter(configured) instanceof SshAdapter, true);
  assert.equal("keyPath" in publicServer(configured), false);
});

test("validated startup accepts valid config and rejects malformed config", async () => {
  await writeConfiguration([]);
  const localOnlyServer = await startServerForTest();
  await closeServer(localOnlyServer);

  await writeConfiguration([
    remote("dark"),
    remote("minecraft"),
    remote("backup")
  ]);
  const server = await startServerForTest();

  const origin = `http://127.0.0.1:${process.env.PORT}`;
  const loginResponse = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.ADMIN_USER,
      password: process.env.ADMIN_PASSWORD
    })
  });
  assert.equal(loginResponse.status, 200);

  const cookie = loginResponse.headers.get("set-cookie").split(";", 1)[0];
  const serversResponse = await fetch(`${origin}/api/servers`, {
    headers: { Cookie: cookie }
  });
  assert.equal(serversResponse.status, 200);

  const payload = await serversResponse.json();
  assert.deepEqual(
    payload.servers.map((serverEntry) => serverEntry.id),
    ["local", "dark", "minecraft", "backup"]
  );
  assert.equal(
    payload.servers.some((serverEntry) => "keyPath" in serverEntry),
    false
  );

  await closeServer(server);

  await fsp.writeFile(serversPath, "{not-json", "utf8");
  await assert.rejects(
    startValidatedServer(),
    /Could not load server configuration/
  );
});
