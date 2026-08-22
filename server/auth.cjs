const config = require("./config.cjs");
const { HttpError, sendJson } = require("./http.cjs");

const {
  safeEqual,
  verifySession,
  createSessionCookie,
  destroySession,
  clearSessionCookie
} = require("./auth/sessions.cjs");

function login(req, res, body) {
  if (!config.adminPassword) {
    throw new HttpError(
      503,
      "Set ADMIN_PASSWORD before starting the file manager."
    );
  }

  if (
    !safeEqual(body.username || "", config.adminUser) ||
    !safeEqual(body.password || "", config.adminPassword)
  ) {
    throw new HttpError(401, "Invalid username or password");
  }

  res.setHeader("Set-Cookie", createSessionCookie(req));

  sendJson(res, 200, {
    ok: true,
    username: config.adminUser
  });
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
  if (!config.adminPassword) {
    throw new HttpError(
      503,
      "Set ADMIN_PASSWORD before starting the file manager."
    );
  }

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
  logout,
  requireAuth,
  sessionStatus
};