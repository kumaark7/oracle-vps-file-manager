const crypto = require("crypto");
const store = require("./store.cjs");

const TOTP_FILE = "totp.json";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ALGORITHM = "sha1";
const DIGITS = 6;
const PERIOD_SECONDS = 30;
const WINDOW = 1;
let totpMutation = Promise.resolve();

function withTotpLock(operation) {
  const next = totpMutation.then(operation, operation);
  totpMutation = next.catch(() => {});
  return next;
}

function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }

    value = bits > 0 ? value & ((1 << bits) - 1) : 0;
  }

  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/[\s=-]/g, "");

  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error("Invalid authenticator secret");
  }

  let bits = 0;
  let accumulator = 0;
  const output = [];

  for (const character of normalized) {
    accumulator = (accumulator << 5) | ALPHABET.indexOf(character);
    bits += 5;

    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 0xff);
      bits -= 8;
    }

    accumulator = bits > 0
      ? accumulator & ((1 << bits) - 1)
      : 0;
  }

  return Buffer.from(output);
}

function normalizeCode(value) {
  return String(value || "").trim();
}

function counterForTime(now) {
  return Math.floor(Number(now) / 1000 / PERIOD_SECONDS);
}

function codeForCounter(secret, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto
    .createHmac(ALGORITHM, decodeBase32(secret))
    .update(counterBuffer)
    .digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** DIGITS);

  return String(value).padStart(DIGITS, "0");
}

function safeCodeEqual(first, second) {
  const firstBuffer = Buffer.from(String(first));
  const secondBuffer = Buffer.from(String(second));

  return firstBuffer.length === secondBuffer.length &&
    crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function generateTotpCode(secret, now = Date.now()) {
  return codeForCounter(secret, counterForTime(now));
}

function buildTotpUri({ secret, issuer, account }) {
  const label = `${issuer}:${account}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: ALGORITHM.toUpperCase(),
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS)
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${query}`;
}

async function configureTotp({
  issuer = "Oracle VPS File Manager",
  account = "admin"
} = {}) {
  return withTotpLock(async () => {
    const secret = encodeBase32(crypto.randomBytes(20));
    const data = {
      version: 1,
      createdAt: new Date().toISOString(),
      issuer,
      account,
      algorithm: ALGORITHM.toUpperCase(),
      digits: DIGITS,
      period: PERIOD_SECONDS,
      secret,
      lastUsedCounter: null,
      lastUsedAt: null
    };

    await store.writeJson(TOTP_FILE, data);

    return {
      secret,
      uri: buildTotpUri(data)
    };
  });
}

async function verifyAndConsumeTotp(code, now = Date.now()) {
  const normalized = normalizeCode(code);
  if (!/^\d{6}$/.test(normalized)) return false;

  return withTotpLock(async () => {
    const data = await store.readJson(TOTP_FILE, null);
    if (!data?.secret) return false;

    const currentCounter = counterForTime(now);
    const lastUsedCounter = Number.isSafeInteger(data.lastUsedCounter)
      ? data.lastUsedCounter
      : -1;
    let matchedCounter = null;

    for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
      const candidateCounter = currentCounter + offset;
      if (candidateCounter < 0 || candidateCounter <= lastUsedCounter) continue;

      const candidate = codeForCounter(data.secret, candidateCounter);
      if (safeCodeEqual(normalized, candidate)) {
        matchedCounter = candidateCounter;
      }
    }

    if (matchedCounter === null) return false;

    await store.writeJson(TOTP_FILE, {
      ...data,
      lastUsedCounter: matchedCounter,
      lastUsedAt: new Date(now).toISOString()
    });

    return true;
  });
}

async function totpStatus() {
  const data = await store.readJson(TOTP_FILE, null);

  return {
    configured: Boolean(data?.secret),
    createdAt: data?.createdAt || null,
    issuer: data?.issuer || null,
    account: data?.account || null
  };
}

async function disableTotp() {
  return withTotpLock(async () => {
    await store.deleteFile(TOTP_FILE);
  });
}

module.exports = {
  configureTotp,
  disableTotp,
  generateTotpCode,
  totpStatus,
  verifyAndConsumeTotp
};
