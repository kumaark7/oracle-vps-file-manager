const path = require("path");
const { HttpError } = require("./http.cjs");

function resolveRootPath(rootPath, inputPath = "/") {
  const root = path.resolve(rootPath);
  const requested = String(inputPath || "/").replace(/\\/g, "/");
  if (requested.includes("\0")) throw new HttpError(400, "Invalid path");
  const relative = requested.startsWith("/") ? requested.slice(1) : requested;
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(403, "Path is outside the configured file root");
  }
  return absolute;
}

function toVirtualPath(rootPath, absolute) {
  const relative = path.relative(path.resolve(rootPath), absolute).replace(/\\/g, "/");
  return relative ? `/${relative}` : "/";
}

function parentPath(remotePath) {
  if (!remotePath || remotePath === "/") return "/";
  const clean = String(remotePath).replace(/\/$/, "");
  const index = clean.lastIndexOf("/");
  return index <= 0 ? "/" : clean.slice(0, index);
}

function safeName(name) {
  const clean = String(name || "").trim();
  if (!clean || clean.includes("/") || clean.includes("\\") || clean.includes("\0") || clean === "." || clean === "..") {
    throw new HttpError(400, "Invalid file or folder name");
  }
  return clean;
}

module.exports = { parentPath, resolveRootPath, safeName, toVirtualPath };
