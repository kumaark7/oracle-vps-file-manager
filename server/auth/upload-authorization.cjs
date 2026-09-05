const crypto = require("crypto");
const config = require("../config.cjs");
const { onSessionDestroyed } = require("./sessions.cjs");

const authorizations = new Map();

function tokenDigest(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function removeExpired(now = Date.now()) {
  for (const [digest, authorization] of authorizations) {
    if (authorization.expiresAt <= now) authorizations.delete(digest);
  }
}

function createLargeUploadAuthorizations(sessionId, uploads) {
  removeExpired();
  return uploads.map((upload) => {
    const token = crypto.randomBytes(32).toString("base64url");
    authorizations.set(tokenDigest(token), {
      sessionId,
      serverId: upload.serverId,
      path: upload.path,
      size: upload.size,
      expiresAt: Date.now() + config.largeUploadAuthorizationTtlMs
    });
    return token;
  });
}

function consumeLargeUploadAuthorization(sessionId, token, expected) {
  removeExpired();
  const digest = tokenDigest(token);
  const authorization = authorizations.get(digest);
  if (!authorization) return false;
  authorizations.delete(digest);
  return authorization.sessionId === sessionId &&
    authorization.serverId === expected.serverId &&
    authorization.path === expected.path &&
    authorization.size === expected.size;
}

function clearSessionAuthorizations(sessionId) {
  for (const [digest, authorization] of authorizations) {
    if (authorization.sessionId === sessionId) authorizations.delete(digest);
  }
}

onSessionDestroyed(clearSessionAuthorizations);

module.exports = {
  clearSessionAuthorizations,
  consumeLargeUploadAuthorization,
  createLargeUploadAuthorizations
};
