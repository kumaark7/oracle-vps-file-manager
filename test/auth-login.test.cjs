const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "ovfm-auth-login-")
);
const authDir = path.join(temporaryRoot, "auth");
const serversPath = path.join(temporaryRoot, "servers.json");

process.env.OVFM_AUTH_DIR = authDir;
process.env.OVFM_SERVERS_PATH = serversPath;
process.env.PORT = "49181";
process.env.HOST = "127.0.0.1";
process.env.SESSION_SECRET = "test-only-session-secret-32-bytes-minimum";
process.env.ADMIN_USER = "auth-test";
process.env.ADMIN_PASSWORD = "password-fallback-test";
process.env.TRUST_PROXY = "true";

const {
  generateRecoveryCodes,
  remainingRecoveryCodes
} = require("../server/auth/recovery.cjs");
const {
  configureTotp,
  generateTotpCode
} = require("../server/auth/totp.cjs");
const { startValidatedServer } = require("../server/index.cjs");

const origin = `http://127.0.0.1:${process.env.PORT}`;
let server;
let recoveryCodes;
let totpSecret;

async function post(pathname, body, address) {
  return fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(address ? { "X-Real-IP": address } : {})
    },
    body: JSON.stringify(body)
  });
}

test.before(async () => {
  await fsp.writeFile(
    serversPath,
    JSON.stringify({ servers: [] }),
    "utf8"
  );
  recoveryCodes = await generateRecoveryCodes();
  ({ secret: totpSecret } = await configureTotp({
    account: process.env.ADMIN_USER
  }));
  server = await startValidatedServer();

  if (!server.listening) {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
  }
});

test.after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  await fsp.rm(temporaryRoot, {
    recursive: true,
    force: true
  });
});

test("keeps password authentication available", async () => {
  const response = await post("/api/login", {
    username: process.env.ADMIN_USER,
    password: process.env.ADMIN_PASSWORD
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /ovfm_session=/);
});

test("accepts an authenticator code through the password field", async () => {
  const code = generateTotpCode(totpSecret);
  const response = await post(
    "/api/login",
    {
      username: process.env.ADMIN_USER,
      password: code
    },
    "203.0.113.5"
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /ovfm_session=/);

  const replay = await post(
    "/api/login",
    {
      username: process.env.ADMIN_USER,
      password: code
    },
    "203.0.113.6"
  );

  assert.equal(replay.status, 401);
});

test("rate limits invalid authenticator codes per client", async () => {
  const now = Date.now();
  const validCodes = new Set([
    generateTotpCode(totpSecret, now - 30_000),
    generateTotpCode(totpSecret, now),
    generateTotpCode(totpSecret, now + 30_000)
  ]);
  const invalidCode = ["000000", "111111", "222222", "333333"]
    .find((candidate) => !validCodes.has(candidate));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await post(
      "/api/login",
      {
        username: process.env.ADMIN_USER,
        password: invalidCode
      },
      "203.0.113.7"
    );

    assert.equal(response.status, 401);
  }

  const blocked = await post(
    "/api/login",
    {
      username: process.env.ADMIN_USER,
      password: invalidCode
    },
    "203.0.113.7"
  );

  assert.equal(blocked.status, 429);
});

test("recovery login creates a session and consumes exactly one code", async () => {
  assert.equal(await remainingRecoveryCodes(), 10);

  const response = await post(
    "/api/login/recovery",
    { code: recoveryCodes[0] },
    "203.0.113.10"
  );
  assert.equal(response.status, 200);

  const cookie = response.headers.get("set-cookie").split(";", 1)[0];
  const sessionResponse = await fetch(`${origin}/api/session`, {
    headers: { Cookie: cookie }
  });
  const session = await sessionResponse.json();

  assert.equal(session.authenticated, true);
  assert.equal(session.username, process.env.ADMIN_USER);
  assert.equal(await remainingRecoveryCodes(), 9);

  const reuseResponse = await post(
    "/api/login/recovery",
    { code: recoveryCodes[0] },
    "203.0.113.11"
  );
  assert.equal(reuseResponse.status, 401);
  assert.equal(await remainingRecoveryCodes(), 9);
});

test("recovery failures are generic and rate limited per client", async () => {
  const submitted = "INVALID-RECOVERY-CODE";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await post(
      "/api/login/recovery",
      { code: submitted },
      "203.0.113.20"
    );
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Invalid recovery code");
    assert.equal(JSON.stringify(payload).includes(submitted), false);
  }

  const blocked = await post(
    "/api/login/recovery",
    { code: submitted },
    "203.0.113.20"
  );
  assert.equal(blocked.status, 429);
  assert.equal(await remainingRecoveryCodes(), 9);
});
