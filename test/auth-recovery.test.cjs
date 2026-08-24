const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const temporaryRoot = require("node:fs").mkdtempSync(
  path.join(os.tmpdir(), "ovfm-recovery-")
);

process.env.OVFM_AUTH_DIR = path.join(temporaryRoot, "auth");

const {
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
  remainingRecoveryCodes
} = require("../server/auth/recovery.cjs");
const store = require("../server/auth/store.cjs");

const recoveryPath = path.join(
  process.env.OVFM_AUTH_DIR,
  "recovery.json"
);

test.after(async () => {
  await fsp.rm(temporaryRoot, {
    recursive: true,
    force: true
  });
});

test("recovery codes remain hashed and strictly single-use", async () => {
  const codes = await generateRecoveryCodes();

  assert.equal(codes.length, 10);
  assert.equal(await remainingRecoveryCodes(), 10);

  const storedBefore = JSON.parse(
    await fsp.readFile(recoveryPath, "utf8")
  );

  assert.deepEqual(
    Object.keys(storedBefore).sort(),
    ["codes", "createdAt", "version"]
  );
  assert.equal(storedBefore.version, 1);
  assert.equal(storedBefore.codes.length, 10);

  for (const entry of storedBefore.codes) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      ["hash", "id", "salt"]
    );
    assert.equal(typeof entry.id, "string");
    assert.equal(typeof entry.salt, "string");
    assert.equal(typeof entry.hash, "string");
  }

  assert.equal(
    new Set(storedBefore.codes.map((entry) => entry.salt)).size,
    10
  );

  const serialized = JSON.stringify(storedBefore);
  for (const code of codes) {
    assert.equal(serialized.includes(code), false);
  }

  const concurrentResults = await Promise.all([
    verifyAndConsumeRecoveryCode(codes[0]),
    verifyAndConsumeRecoveryCode(codes[0])
  ]);

  assert.deepEqual(
    [...concurrentResults].sort(),
    [false, true]
  );
  assert.equal(await remainingRecoveryCodes(), 9);
  assert.equal(
    await verifyAndConsumeRecoveryCode(codes[0]),
    false
  );
  assert.equal(await remainingRecoveryCodes(), 9);

  const beforeInvalid = await fsp.readFile(recoveryPath);

  assert.equal(
    await verifyAndConsumeRecoveryCode("NOT-A-RECOVERY-CODE"),
    false
  );
  assert.equal(await remainingRecoveryCodes(), 9);

  const afterInvalid = await fsp.readFile(recoveryPath);
  assert.deepEqual(afterInvalid, beforeInvalid);

  const originalWriteJson = store.writeJson;
  store.writeJson = async () => {
    throw new Error("Simulated persistence failure");
  };

  try {
    await assert.rejects(
      verifyAndConsumeRecoveryCode(codes[1]),
      /Simulated persistence failure/
    );
  } finally {
    store.writeJson = originalWriteJson;
  }

  assert.equal(await remainingRecoveryCodes(), 9);
  assert.equal(
    await verifyAndConsumeRecoveryCode(codes[1]),
    true
  );
  assert.equal(await remainingRecoveryCodes(), 8);

  if (process.platform !== "win32") {
    const directoryMode = (
      await fsp.stat(process.env.OVFM_AUTH_DIR)
    ).mode & 0o777;
    const fileMode = (
      await fsp.stat(recoveryPath)
    ).mode & 0o777;

    assert.equal(directoryMode, 0o700);
    assert.equal(fileMode, 0o600);
  }
});
