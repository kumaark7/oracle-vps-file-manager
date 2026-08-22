const crypto = require("crypto");
const config = require("../config.cjs");
const { requestIsSecure } = require("../http.cjs");

const sessions = new Map();
const COOKIE_NAME = "ovfm_session";

function parseCookies(req) {
  const cookies = {};

  for (const item of String(req.headers.cookie || "").split(";")) {
    const trimmed = item.trim();
    if (!trimmed) continue;

    const index = trimmed.indexOf("=");
    const key = index === -1 ? trimmed : trimmed.slice(0, index);
    const value = index === -1 ? "" : trimmed.slice(index + 1);

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = "";
    }
  }

  return cookies;
}

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(String(first));
  const secondBuffer = Buffer.from(String(second));

  return (
    firstBuffer.length === secondBuffer.length &&
    crypto.timingSafeEqual(firstBuffer, secondBuffer)
  );
}

function createSessionToken() {
  const id = crypto.randomBytes(32).toString("hex");

  const signature = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(id)
    .digest("hex");

  sessions.set(id, Date.now() + config.sessionTtlMs);

  return `${id}.${signature}`;
}

function getSessionId(req) {
  const token = parseCookies(req)[COOKIE_NAME];

  if (!token) {
    return null;
  }

  const [id, signature, extra] = token.split(".");

  if (!id || !signature || extra) {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(id)
    .digest("hex");

  if (!safeEqual(signature, expected)) {
    return null;
  }

  return id;
}

function verifySession(req) {
  const id = getSessionId(req);

  if (!id) {
    return false;
  }

  const expiresAt = sessions.get(id);

  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(id);
    return false;
  }

  sessions.set(id, Date.now() + config.sessionTtlMs);

  return true;
}

function makeCookie(req, token, maxAge) {
  const secure = requestIsSecure(req, config.trustProxy)
    ? "; Secure"
    : "";

  return `${COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function createSessionCookie(req) {
  return makeCookie(
    req,
    createSessionToken(),
    Math.floor(config.sessionTtlMs / 1000)
  );
}

function destroySession(req) {
  const id = getSessionId(req);

  if (id) {
    sessions.delete(id);
  }
}

function clearSessionCookie(req) {
  return makeCookie(req, "", 0);
}

module.exports = {
  safeEqual,
  verifySession,
  createSessionCookie,
  destroySession,
  clearSessionCookie
};
