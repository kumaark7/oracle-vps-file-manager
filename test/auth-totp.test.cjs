const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "ovfm-auth-totp-")
);
const authDir = path.join(temporaryRoot, "auth");

process.env.OVFM_AUTH_DIR = authDir;
process.env.SESSION_SECRET = "test-only-session-secret-32-bytes-minimum";
process.env.ADMIN_USER = "totp-test";

const {
  configureTotp,
  disableTotp,
  generateTotpCode,
  totpStatus,
  verifyAndConsumeTotp
} = require("../server/auth/totp.cjs");

test.after(async () => {
  await fsp.rm(temporaryRoot, {
    recursive: true,
    force: true
  });
});

test("matches the RFC 6238 SHA-1 test secret at 59 seconds", () => {
  const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(generateTotpCode(rfcSecret, 59_000), "287082");
});

test("configures a standard authenticator account without exposing it through status", async () => {
  const setup = await configureTotp({
    issuer: "OVFM Test",
    account: process.env.ADMIN_USER
  });

  assert.match(setup.secret, /^[A-Z2-7]{32}$/);
  assert.match(setup.uri, /^otpauth:\/\/totp\//);
  assert.match(setup.uri, /algorithm=SHA1/);
  assert.match(setup.uri, /digits=6/);
  assert.match(setup.uri, /period=30/);

  const status = await totpStatus();
  assert.deepEqual(status, {
    configured: true,
    createdAt: status.createdAt,
    issuer: "OVFM Test",
    account: process.env.ADMIN_USER
  });
  assert.equal(JSON.stringify(status).includes(setup.secret), false);

  if (process.platform !== "win32") {
    assert.equal((await fsp.stat(authDir)).mode & 0o777, 0o700);
    assert.equal((await fsp.stat(path.join(authDir, "totp.json"))).mode & 0o777, 0o600);
  }
});

test("accepts a valid code once and serializes concurrent replay attempts", async () => {
  const { secret } = await configureTotp({ account: process.env.ADMIN_USER });
  const now = 1_800_000_000_000;
  const code = generateTotpCode(secret, now);

  const results = await Promise.all([
    verifyAndConsumeTotp(code, now),
    verifyAndConsumeTotp(code, now)
  ]);

  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(await verifyAndConsumeTotp(code, now), false);

  const nextCode = generateTotpCode(secret, now + 30_000);
  assert.equal(await verifyAndConsumeTotp(nextCode, now + 30_000), true);
});

test("invalid codes do not change the consumed counter", async () => {
  const { secret } = await configureTotp({ account: process.env.ADMIN_USER });
  const target = path.join(authDir, "totp.json");
  const before = await fsp.readFile(target, "utf8");
  const validCodes = new Set([
    generateTotpCode(secret, 0),
    generateTotpCode(secret, 30_000)
  ]);
  const numericInvalid = ["000000", "111111", "222222"]
    .find((candidate) => !validCodes.has(candidate));

  assert.equal(await verifyAndConsumeTotp("not-a-code"), false);
  assert.equal(await verifyAndConsumeTotp(numericInvalid, 0), false);
  assert.equal(await fsp.readFile(target, "utf8"), before);
});

test("can disable authenticator login", async () => {
  await disableTotp();
  assert.equal((await totpStatus()).configured, false);
});
