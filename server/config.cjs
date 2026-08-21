const crypto = require("crypto");
const os = require("os");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function booleanValue(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`${name} must be true or false`);
}

const defaultRoot =
  process.env.FILE_ROOT ||
  process.env.USERPROFILE ||
  process.env.HOME ||
  (process.platform === "win32" ? PROJECT_ROOT : "/home/ubuntu");

const config = {
  projectRoot: PROJECT_ROOT,
  distDir: path.join(PROJECT_ROOT, "dist"),
  remoteAgentPath: path.join(__dirname, "remote", "file-agent.py"),
  port: positiveInteger("PORT", 4174),
  host: process.env.HOST || "127.0.0.1",
  fileRoot: path.resolve(defaultRoot),
  adminUser: process.env.ADMIN_USER || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  sessionTtlMs: positiveInteger("SESSION_TTL_MS", 12 * 60 * 60 * 1000),
  maxJsonBytes: positiveInteger("MAX_JSON_BYTES", 2 * 1024 * 1024),
  maxUploadBytes: positiveInteger("MAX_UPLOAD_BYTES", 150 * 1024 * 1024),
  maxEditBytes: positiveInteger("MAX_EDIT_BYTES", 5 * 1024 * 1024),
  maxProcessBytes: positiveInteger("MAX_PROCESS_BYTES", 220 * 1024 * 1024),
  commentsPath: path.resolve(process.env.OVFM_COMMENTS_PATH || path.join(os.homedir(), ".oracle-vps-file-manager-comments.json")),
  serversPath: path.resolve(process.env.OVFM_SERVERS_PATH || path.join(PROJECT_ROOT, ".ovfm-servers.json")),
  publicHost: process.env.OVFM_PUBLIC_HOST || "",
  localServerName: process.env.OVFM_LOCAL_SERVER_NAME || "",
  localServerUser: process.env.OVFM_LOCAL_SERVER_USER || "",
  trustProxy: booleanValue("TRUST_PROXY", true)
};

if (config.sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}

if (!process.env.SESSION_SECRET) {
  console.warn("SESSION_SECRET is not set; sessions will be invalidated when the process restarts.");
}

module.exports = config;
