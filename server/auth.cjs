const crypto = require("crypto");
const config = require("./config.cjs");
const { HttpError, requestIsSecure, sendJson } = require("./http.cjs");

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
  return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function createSession() {
  const id = crypto.randomBytes(32).toString("hex");
  const signature = crypto.createHmac("sha256", config.sessionSecret).update(id).digest("hex");
  sessions.set(id, Date.now() + config.sessionTtlMs);
  return `${id}.${signature}`;
}

function sessionId(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const [id, signature, extra] = token.split(".");
  if (!id || !signature || extra) return null;
  const expected = crypto.createHmac("sha256", config.sessionSecret).update(id).digest("hex");
  if (!safeEqual(signature, expected)) return null;
  return id;
}

function verifySession(req) {
  const id = sessionId(req);
  if (!id) return false;
  const expiresAt = sessions.get(id);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(id);
    return false;
  }
  sessions.set(id, Date.now() + config.sessionTtlMs);
  return true;
}

function cookieValue(req, token, maxAge) {
  const secure = requestIsSecure(req, config.trustProxy) ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function login(req, res, body) {
  if (!config.adminPassword) throw new HttpError(503, "Set ADMIN_PASSWORD before starting the file manager.");
  if (!safeEqual(body.username || "", config.adminUser) || !safeEqual(body.password || "", config.adminPassword)) {
    throw new HttpError(401, "Invalid username or password");
  }
  res.setHeader("Set-Cookie", cookieValue(req, createSession(), Math.floor(config.sessionTtlMs / 1000)));
  sendJson(res, 200, { ok: true, username: config.adminUser });
}

function logout(req, res) {
  const id = sessionId(req);
  if (id) sessions.delete(id);
  res.setHeader("Set-Cookie", cookieValue(req, "", 0));
  sendJson(res, 200, { ok: true });
}

function requireAuth(req) {
  if (!config.adminPassword) throw new HttpError(503, "Set ADMIN_PASSWORD before starting the file manager.");
  if (!verifySession(req)) throw new HttpError(401, "Login required");
}

function sessionStatus(req) {
  return {
    authenticated: verifySession(req),
    username: config.adminUser,
    passwordConfigured: Boolean(config.adminPassword),
    defaultServerId: "local"
  };
}

module.exports = { login, logout, requireAuth, sessionStatus };
