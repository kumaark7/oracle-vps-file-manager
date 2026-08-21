const { pipeline } = require("stream/promises");
const { Transform } = require("stream");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendError(res, error) {
  if (res.headersSent || res.destroyed) return;
  const status = error instanceof HttpError ? error.status : statusForError(error);
  const message = error instanceof HttpError ? error.message : status >= 500 ? "The server could not complete the request" : error.message;
  if (status >= 500) console.error(error);
  sendJson(res, status, { error: message });
}

function limitStream(maxBytes) {
  let size = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) callback(new HttpError(413, "Request body is too large"));
      else callback(null, chunk);
    }
  });
}

function statusForError(error) {
  if (error?.code === "ENOENT") return 404;
  if (["EACCES", "EPERM"].includes(error?.code)) return 403;
  if (["EEXIST", "ENOTDIR", "EISDIR", "ENOTEMPTY"].includes(error?.code)) return 400;
  return 500;
}

function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

async function readBuffer(req, limit) {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > limit) throw new HttpError(413, "Request body is too large");

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, limit) {
  const buffer = await readBuffer(req, limit);
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function requireValue(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new HttpError(400, `${label} is required`);
  }
  return value;
}

function requestIsSecure(req, trustProxy) {
  if (req.socket.encrypted) return true;
  if (!trustProxy || !isLoopback(req.socket.remoteAddress)) return false;
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() === "https";
}

function isLoopback(address = "") {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function contentDisposition(fileName) {
  const safeAscii = String(fileName || "download").replace(/[\r\n"\\]/g, "_");
  const encoded = encodeURIComponent(String(fileName || "download"));
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

module.exports = {
  HttpError,
  contentDisposition,
  limitStream,
  parseUrl,
  pipeline,
  readBuffer,
  readJson,
  requestIsSecure,
  requireValue,
  sendError,
  sendJson
};
