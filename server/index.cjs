const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");
const config = require("./config.cjs");
const { HttpError, parseUrl, sendError } = require("./http.cjs");
const { handleApi } = require("./routes/index.cjs");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

function staticPath(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    throw new HttpError(400, "Invalid URL path");
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const absolute = path.resolve(config.distDir, relative);
  const relation = path.relative(config.distDir, absolute);
  if (relation.startsWith("..") || path.isAbsolute(relation)) throw new HttpError(403, "Forbidden");
  return absolute;
}

async function serveFile(req, res, filePath) {
  const stats = await fsp.stat(filePath);
  if (!stats.isFile()) throw new HttpError(404, "Not found");
  res.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": stats.size,
    "X-Content-Type-Options": "nosniff"
  });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(filePath).pipe(res);
}

async function serveStatic(req, res) {
  if (!["GET", "HEAD"].includes(req.method)) throw new HttpError(405, "Method not allowed");
  const requestUrl = parseUrl(req);
  try {
    await serveFile(req, res, staticPath(requestUrl.pathname));
  } catch (error) {
    if (error.code !== "ENOENT" && error.status !== 404) throw error;
    await serveFile(req, res, path.join(config.distDir, "index.html"));
  }
}

function createApplicationServer() {
  return http.createServer((req, res) => {
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (String(req.url || "").startsWith("/api/")) {
      handleApi(req, res);
      return;
    }
    serveStatic(req, res).catch((error) => sendError(res, error));
  });
}

function startServer() {
  const server = createApplicationServer();
  server.listen(config.port, config.host, () => {
    console.log(`Oracle VPS File Manager running at http://${config.host}:${config.port}`);
    console.log(`Project folder: ${config.projectRoot}`);
    console.log(`Local file root: ${config.fileRoot}`);
    console.log(`Server config path: ${config.serversPath}`);
    console.log(config.adminPassword ? `Login user: ${config.adminUser}` : "ADMIN_PASSWORD is not set. The UI will not allow login.");
  });
  return server;
}

if (require.main === module) startServer();

module.exports = { createApplicationServer, startServer };
