const crypto = require("crypto");
const { promisify } = require("util");
const store = require("./store.cjs");

const scryptAsync = promisify(crypto.scrypt);

const RECOVERY_FILE = "recovery.json";
const CODE_COUNT = 10;
const CODE_BYTES = 9;
let recoveryMutation = Promise.resolve();

function withRecoveryLock(operation) {
  const next = recoveryMutation.then(operation, operation);

  recoveryMutation = next.catch(() => {});

  return next;
}

function formatCode(buffer) {
  const raw = buffer
    .toString("base64url")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);

  return raw.match(/.{1,4}/g).join("-");
}

function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function hashCode(code, salt = crypto.randomBytes(16)) {
  const normalized = normalizeCode(code);

  const derived = await scryptAsync(
    normalized,
    salt,
    32
  );

  return {
    salt: salt.toString("base64"),
    hash: Buffer.from(derived).toString("base64")
  };
}

async function verifyHash(code, entry) {
  const normalized = normalizeCode(code);

  const salt = Buffer.from(entry.salt, "base64");
  const expected = Buffer.from(entry.hash, "base64");

  const derived = Buffer.from(
    await scryptAsync(normalized, salt, expected.length)
  );

  return (
    derived.length === expected.length &&
    crypto.timingSafeEqual(derived, expected)
  );
}

async function generateRecoveryCodes() {
  return withRecoveryLock(async () => {
    const plaintext = [];
    const stored = [];

    for (let index = 0; index < CODE_COUNT; index += 1) {
      const code = formatCode(crypto.randomBytes(CODE_BYTES));
      plaintext.push(code);

      const entry = await hashCode(code);

      stored.push({
        id: crypto.randomUUID(),
        ...entry
      });
    }

    await store.writeJson(RECOVERY_FILE, {
      version: 1,
      createdAt: new Date().toISOString(),
      codes: stored
    });

    return plaintext;
  });
}

async function verifyAndConsumeRecoveryCode(code) {
  return withRecoveryLock(async () => {
    const data = await store.readJson(RECOVERY_FILE, {
      version: 1,
      createdAt: null,
      codes: []
    });

    if (!Array.isArray(data.codes) || data.codes.length === 0) {
      return false;
    }

    for (let index = 0; index < data.codes.length; index += 1) {
      const entry = data.codes[index];

      if (await verifyHash(code, entry)) {
        data.codes.splice(index, 1);

        await store.writeJson(RECOVERY_FILE, data);

        return true;
      }
    }

    return false;
  });
}

async function remainingRecoveryCodes() {
  const data = await store.readJson(RECOVERY_FILE, {
    codes: []
  });

  return Array.isArray(data.codes)
    ? data.codes.length
    : 0;
}

module.exports = {
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
  remainingRecoveryCodes
};
