const path = require("path");
const { TextDecoder } = require("util");
const { HttpError } = require("../http.cjs");

const BINARY_EXTENSIONS = new Set([
  ".7z", ".avi", ".bmp", ".class", ".dll", ".dmg", ".doc", ".docx",
  ".exe", ".gif", ".gz", ".ico", ".iso", ".jar", ".jpeg", ".jpg",
  ".mkv", ".mov", ".mp3", ".mp4", ".odt", ".pdf", ".png", ".ppt",
  ".pptx", ".rar", ".so", ".tar", ".tgz", ".wav", ".webm", ".webp",
  ".woff", ".woff2", ".xls", ".xlsx", ".xz", ".zip"
]);

function isObviousBinaryPath(remotePath) {
  return BINARY_EXTENSIONS.has(path.extname(String(remotePath || "")).toLowerCase());
}

function assertEditablePath(remotePath) {
  if (isObviousBinaryPath(remotePath)) {
    throw new HttpError(415, "This file type cannot be edited in the browser");
  }
}

function decodeEditableBuffer(buffer, remotePath) {
  assertEditablePath(remotePath);
  if (buffer.includes(0)) throw new HttpError(415, "This file appears to contain binary data");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new HttpError(415, "This file is not valid UTF-8 text");
  }
}

async function readEditableText(adapter, remotePath, maxBytes) {
  return decodeEditableBuffer(await adapter.readBuffer(remotePath, maxBytes), remotePath);
}

module.exports = { assertEditablePath, decodeEditableBuffer, isObviousBinaryPath, readEditableText };

