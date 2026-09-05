const config = require("./config.cjs");
const {
  HttpError,
  requestClientAddress,
  sendJson
} = require("./http.cjs");
const {
  verifyAndConsumeRecoveryCode
} = require("./auth/recovery.cjs");
const { verifyAndConsumeTotp } = require("./auth/totp.cjs");
const { createAttemptLimiter } = require("./auth/rate-limit.cjs");
const { createLargeUploadAuthorizations } = require("./auth/upload-authorization.cjs");

const {
  safeEqual,
  verifySession,
  verifySessionId,
  createSessionCookie,
  destroySession,
  clearSessionCookie
} = require("./auth/sessions.cjs");

const recoveryAttempts = createAttemptLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000
});

const totpAttempts = createAttemptLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000
});

const largeUploadAttempts = createAttemptLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000
});

function uploadLimits() {
  return {
    uploadLimitBytes: config.maxUploadBytes,
    largeUploadMaxBytes: config.maxLargeUploadBytes
  };
}

function sendAuthenticated(req, res, username = config.adminUser) {
  res.setHeader("Set-Cookie", createSessionCookie(req));

  sendJson(res, 200, {
    ok: true,
    username,
    ...uploadLimits()
  });
}

function validateLargeUploads(uploads) {
  if (!Array.isArray(uploads) || uploads.length < 1 || uploads.length > 1000) {
    throw new HttpError(400, "Large upload selection is invalid");
  }
  return uploads.map((upload) => {
    const serverId = String(upload?.serverId || "").trim();
    const uploadPath = String(upload?.path || "").trim();
    const size = Number(upload?.size);
    if (
      !serverId ||
      !uploadPath.startsWith("/") ||
      uploadPath.includes("\0") ||
      uploadPath.includes("\\") ||
      uploadPath.length > 4096 ||
      !Number.isSafeInteger(size) ||
      size <= config.maxUploadBytes ||
      size > config.maxLargeUploadBytes
    ) {
      throw new HttpError(400, "Large upload selection is invalid");
    }
    return { serverId, path: uploadPath, size };
  });
}

function authorizeLargeUploads(req, res, body, sessionId) {
  const password = String(body.password || "");
  const attemptKey = `${sessionId}:${requestClientAddress(req, config.trustProxy)}`;
  if (!largeUploadAttempts.take(attemptKey)) {
    throw new HttpError(429, "Too many password attempts. Try again later.");
  }
  if (!config.adminPassword || !safeEqual(password, config.adminPassword)) {
    throw new HttpError(401, "Invalid password");
  }
  largeUploadAttempts.reset(attemptKey);
  const uploads = validateLargeUploads(body.uploads);
  sendJson(res, 200, {
    tokens: createLargeUploadAuthorizations(sessionId, uploads),
    expiresInMs: config.largeUploadAuthorizationTtlMs
  });
}

async function login(req, res, body) {
  const username = String(body.username || "");
  const credential = String(body.password || "");

  if (
    safeEqual(username, config.passwordUser) &&
    config.adminPassword &&
    safeEqual(credential, config.adminPassword)
  ) {
    sendAuthenticated(req, res, config.passwordUser);
    return;
  }

  if (
    safeEqual(username, config.adminUser) &&
    /^\d{6}$/.test(credential.trim())
  ) {
    const attemptKey = requestClientAddress(req, config.trustProxy);

    if (!totpAttempts.take(attemptKey)) {
      throw new HttpError(429, "Too many authenticator attempts. Try again later.");
    }

    if (await verifyAndConsumeTotp(credential)) {
      totpAttempts.reset(attemptKey);
      sendAuthenticated(req, res, config.adminUser);
      return;
    }
  }

  throw new HttpError(401, "Invalid username or credential");
}

async function loginWithRecovery(req, res, body) {
  const code = String(body.code || "");
  if (!code.trim()) {
    throw new HttpError(400, "Recovery code is required");
  }

  const attemptKey = requestClientAddress(req, config.trustProxy);
  if (!recoveryAttempts.take(attemptKey)) {
    throw new HttpError(429, "Too many recovery attempts. Try again later.");
  }

  if (!await verifyAndConsumeRecoveryCode(code)) {
    throw new HttpError(401, "Invalid recovery code");
  }

  recoveryAttempts.reset(attemptKey);
  sendAuthenticated(req, res);
}

function logout(req, res) {
  destroySession(req);

  res.setHeader(
    "Set-Cookie",
    clearSessionCookie(req)
  );

  sendJson(res, 200, { ok: true });
}

function requireAuth(req) {
  const sessionId = verifySessionId(req);
  if (!sessionId) {
    throw new HttpError(401, "Login required");
  }
  return sessionId;
}

function sessionStatus(req) {
  return {
    authenticated: verifySession(req),
    username: config.adminUser,
    passwordConfigured: Boolean(config.adminPassword),
    defaultServerId: "local",
    ...uploadLimits()
  };
}

module.exports = {
  login,
  loginWithRecovery,
  authorizeLargeUploads,
  logout,
  requireAuth,
  sessionStatus
};
