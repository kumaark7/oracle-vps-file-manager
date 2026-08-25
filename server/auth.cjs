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

const {
  safeEqual,
  verifySession,
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

function sendAuthenticated(req, res, username = config.adminUser) {
  res.setHeader("Set-Cookie", createSessionCookie(req));

  sendJson(res, 200, {
    ok: true,
    username
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
  if (!verifySession(req)) {
    throw new HttpError(401, "Login required");
  }
}

function sessionStatus(req) {
  return {
    authenticated: verifySession(req),
    username: config.adminUser,
    passwordConfigured: Boolean(config.adminPassword),
    defaultServerId: "local"
  };
}

module.exports = {
  login,
  loginWithRecovery,
  logout,
  requireAuth,
  sessionStatus
};
