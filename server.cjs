const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || "127.0.0.1";
const DIST_DIR = path.join(__dirname, "dist");
const FILE_ROOT = path.resolve(process.env.FILE_ROOT || process.env.HOME || "/home/ubuntu");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 150 * 1024 * 1024;
const sessions = new Map();
const COMMENTS_PATH = path.join(__dirname, ".ovfm-comments.json");
const IST_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return index === -1 ? [item, ""] : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

function createSession() {
  const id = crypto.randomBytes(32).toString("hex");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(id).digest("hex");
  const token = `${id}.${signature}`;
  sessions.set(id, Date.now() + SESSION_TTL_MS);
  return token;
}

function verifySession(req) {
  const token = parseCookies(req).ovfm_session;
  if (!token) return false;

  const [id, signature] = token.split(".");
  if (!id || !signature) return false;

  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(id).digest("hex");
  if (signature.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  const expiresAt = sessions.get(id);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(id);
    return false;
  }

  sessions.set(id, Date.now() + SESSION_TTL_MS);
  return true;
}

function clearSession(req, res) {
  const token = parseCookies(req).ovfm_session;
  const id = token?.split(".")[0];
  if (id) sessions.delete(id);
  res.setHeader("Set-Cookie", "ovfm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
}

function requireAuth(req, res) {
  if (!ADMIN_PASSWORD) {
    sendError(res, 503, "Set ADMIN_PASSWORD before starting the file manager.");
    return false;
  }

  if (!verifySession(req)) {
    sendError(res, 401, "Login required");
    return false;
  }

  return true;
}

function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function resolveRemotePath(inputPath = "/") {
  const requested = String(inputPath || "/").replace(/\\/g, "/");
  if (requested.includes("\0")) throw new Error("Invalid path");

  const relative = requested.startsWith("/") ? requested.slice(1) : requested;
  const absolute = path.resolve(FILE_ROOT, relative);

  if (absolute !== FILE_ROOT && !absolute.startsWith(`${FILE_ROOT}${path.sep}`)) {
    throw new Error("Path is outside the configured file root");
  }

  return absolute;
}

function toRemotePath(absolute) {
  const relative = path.relative(FILE_ROOT, absolute).replace(/\\/g, "/");
  return relative ? `/${relative}` : "/";
}

function parentRemotePath(remotePath) {
  if (!remotePath || remotePath === "/") return "/";
  const clean = remotePath.replace(/\/$/, "");
  const index = clean.lastIndexOf("/");
  return index <= 0 ? "/" : clean.slice(0, index);
}

function safeName(name) {
  const clean = String(name || "").trim();
  if (!clean || clean.includes("/") || clean.includes("\\") || clean.includes("\0") || clean === "." || clean === "..") {
    throw new Error("Invalid file or folder name");
  }
  return clean;
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readComments() {
  try {
    return JSON.parse(await fsp.readFile(COMMENTS_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeComments(comments) {
  await fsp.writeFile(COMMENTS_PATH, JSON.stringify(comments, null, 2));
}

async function getComment(remotePath) {
  const comments = await readComments();
  return comments[remotePath] || "";
}

async function setComment(remotePath, comment) {
  const comments = await readComments();
  const trimmed = String(comment || "").trim();

  if (trimmed) {
    comments[remotePath] = trimmed;
  } else {
    delete comments[remotePath];
  }

  await writeComments(comments);
}

async function resolveConflictPath(targetPath) {
  if (!(await pathExists(targetPath))) return targetPath;

  const directory = path.dirname(targetPath);
  const extension = path.extname(targetPath);
  const basename = path.basename(targetPath, extension);

  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? " copy" : ` copy ${index}`;
    const candidate = path.join(directory, `${basename}${suffix}${extension}`);
    if (!(await pathExists(candidate))) return candidate;
  }

  throw new Error(`Could not find a free name for ${path.basename(targetPath)}`);
}

async function listFiles(remotePath) {
  const absolute = resolveRemotePath(remotePath);
  const dirents = await fsp.readdir(absolute, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (dirent) => {
      const full = path.join(absolute, dirent.name);
      const stats = await fsp.lstat(full);
      return {
        name: dirent.name,
        path: toRemotePath(full),
        type: dirent.isDirectory() ? "directory" : dirent.isSymbolicLink() ? "link" : "file",
        size: stats.size,
        mode: modeString(stats.mode, dirent),
        modified: formatDate(stats.mtime)
      };
    })
  );

  return { root: FILE_ROOT, path: toRemotePath(absolute), entries };
}

function formatDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) return "";
  return IST_FORMATTER.format(value).replace(",", "");
}

async function getDetails(remotePath) {
  const absolute = resolveRemotePath(remotePath);
  const stats = await fsp.stat(absolute);
  const comment = await getComment(remotePath);

  return {
    name: path.basename(absolute),
    type: stats.isDirectory() ? "Directory" : "File",
    size: stats.size,
    location: parentRemotePath(remotePath),
    path: absolute,
    modified: formatDate(stats.mtime),
    lastUsed: formatDate(stats.atime),
    created: formatDate(stats.birthtime),
    comment
  };
}

function modeString(mode, dirent) {
  const kind = dirent.isDirectory() ? "d" : dirent.isSymbolicLink() ? "l" : "-";
  const flags = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001];
  return kind + flags.map((flag, index) => (mode & flag ? "rwx"[index % 3] : "-")).join("");
}

function detectCategory(fileName) {
  const extension = path.extname(fileName).toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"].includes(extension)) return "images";
  if ([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"].includes(extension)) return "videos";
  if ([".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".xls", ".xlsx", ".csv", ".ppt", ".pptx"].includes(extension)) return "documents";
  return "others";
}

async function scanUsage(absolutePath) {
  const stats = await fsp.lstat(absolutePath);

  if (stats.isSymbolicLink()) {
    return { totalSize: 0, categories: { documents: 0, images: 0, videos: 0, others: 0 } };
  }

  if (stats.isFile()) {
    const category = detectCategory(absolutePath);
    return {
      totalSize: stats.size,
      categories: {
        documents: category === "documents" ? stats.size : 0,
        images: category === "images" ? stats.size : 0,
        videos: category === "videos" ? stats.size : 0,
        others: category === "others" ? stats.size : 0
      }
    };
  }

  if (!stats.isDirectory()) {
    return {
      totalSize: stats.size || 0,
      categories: {
        documents: 0,
        images: 0,
        videos: 0,
        others: stats.size || 0
      }
    };
  }

  const children = await fsp.readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(children.map((child) => scanUsage(path.join(absolutePath, child.name))));

  return nested.reduce(
    (accumulator, item) => ({
      totalSize: accumulator.totalSize + item.totalSize,
      categories: {
        documents: accumulator.categories.documents + item.categories.documents,
        images: accumulator.categories.images + item.categories.images,
        videos: accumulator.categories.videos + item.categories.videos,
        others: accumulator.categories.others + item.categories.others
      }
    }),
    { totalSize: 0, categories: { documents: 0, images: 0, videos: 0, others: 0 } }
  );
}

async function getStorageSummary() {
  const stat = await fsp.statfs(FILE_ROOT);
  const blockSize = stat.bsize || stat.frsize || 4096;
  const totalSpace = stat.blocks * blockSize;
  const availableSpace = stat.bavail * blockSize;
  const usedSpace = totalSpace - stat.bfree * blockSize;
  const entries = await fsp.readdir(FILE_ROOT, { withFileTypes: true });

  const projects = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(FILE_ROOT, entry.name);
      const usage = await scanUsage(absolute);
      return {
        name: entry.name,
        type: entry.isDirectory() ? "folder" : "file",
        size: usage.totalSize,
        path: toRemotePath(absolute)
      };
    })
  );

  const rootUsage = await scanUsage(FILE_ROOT);
  const sortedProjects = projects.sort((first, second) => second.size - first.size);

  return {
    totalSpace,
    usedSpace,
    availableSpace,
    categories: rootUsage.categories,
    projects: sortedProjects,
    topProjects: sortedProjects.slice(0, 8)
  };
}

async function removePath(remotePath) {
  if (remotePath === "/") throw new Error("Refusing to delete the configured file root");
  await fsp.rm(resolveRemotePath(remotePath), { recursive: true, force: true });
}

async function copyPath(fromPath, destinationDirectory) {
  const source = resolveRemotePath(fromPath);
  const target = await resolveConflictPath(path.join(destinationDirectory, path.basename(source)));
  await fsp.cp(source, target, { recursive: true, errorOnExist: true });
}

async function movePath(fromPath, destinationDirectory) {
  const source = resolveRemotePath(fromPath);
  const target = await resolveConflictPath(path.join(destinationDirectory, path.basename(source)));

  try {
    await fsp.rename(source, target);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await fsp.cp(source, target, { recursive: true, errorOnExist: true });
    await fsp.rm(source, { recursive: true, force: true });
  }
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const userOk = String(body.username || "") === ADMIN_USER;
  const passwordOk = String(body.password || "") === ADMIN_PASSWORD;

  if (!ADMIN_PASSWORD) {
    sendError(res, 503, "Set ADMIN_PASSWORD before starting the file manager.");
    return;
  }

  if (!userOk || !passwordOk) {
    sendError(res, 401, "Invalid username or password");
    return;
  }

  const token = createSession();
  res.setHeader("Set-Cookie", `ovfm_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`);
  sendJson(res, 200, { ok: true, username: ADMIN_USER, fileRoot: FILE_ROOT });
}

async function handleApi(req, res) {
  try {
    const requestUrl = parseUrl(req);

    if (req.method === "GET" && requestUrl.pathname === "/api/session") {
      sendJson(res, 200, {
        authenticated: verifySession(req),
        username: ADMIN_USER,
        fileRoot: FILE_ROOT,
        passwordConfigured: Boolean(ADMIN_PASSWORD)
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/login") {
      await handleLogin(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/logout") {
      clearSession(req, res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (!requireAuth(req, res)) return;

    if (req.method === "GET" && requestUrl.pathname === "/api/files") {
      sendJson(res, 200, await listFiles(requestUrl.searchParams.get("path") || "/"));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/details") {
      const remotePath = requestUrl.searchParams.get("path");
      sendJson(res, 200, await getDetails(remotePath));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/storage") {
      sendJson(res, 200, await getStorageSummary());
      return;
    }

    if (req.method === "GET" && (requestUrl.pathname === "/api/read" || requestUrl.pathname === "/api/download")) {
      const absolute = resolveRemotePath(requestUrl.searchParams.get("path"));
      const content = await fsp.readFile(absolute);
      sendJson(res, 200, { content: content.toString("base64") });
      return;
    }

    const body = await readBody(req);

    if (req.method === "POST" && requestUrl.pathname === "/api/mkdir") {
      await fsp.mkdir(path.join(resolveRemotePath(parentRemotePath(body.path)), safeName(path.posix.basename(body.path))), { recursive: true });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/rename") {
      const from = resolveRemotePath(body.from);
      const toParent = resolveRemotePath(parentRemotePath(body.to));
      await fsp.rename(from, path.join(toParent, safeName(path.posix.basename(body.to))));
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/delete") {
      await removePath(body.path);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/comment") {
      await setComment(body.path, body.comment);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/delete-bulk") {
      const paths = Array.isArray(body.paths) ? body.paths : [];
      if (!paths.length) throw new Error("No items selected");
      await Promise.all(paths.map((itemPath) => removePath(itemPath)));
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/paste") {
      const destinationDirectory = resolveRemotePath(body.destination || "/");
      const items = Array.isArray(body.items) ? body.items : [];
      const operation = body.operation === "cut" ? "cut" : "copy";

      if (!items.length) throw new Error("No items selected");

      for (const itemPath of items) {
        if (operation === "cut") {
          await movePath(itemPath, destinationDirectory);
        } else {
          await copyPath(itemPath, destinationDirectory);
        }
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && (requestUrl.pathname === "/api/upload" || requestUrl.pathname === "/api/save")) {
      const absolute = resolveRemotePath(body.path);
      await fsp.mkdir(path.dirname(absolute), { recursive: true });
      await fsp.writeFile(absolute, Buffer.from(String(body.content || ""), "base64"));
      sendJson(res, 200, { ok: true });
      return;
    }

    sendError(res, 404, "API route not found");
  } catch (error) {
    sendError(res, 500, error.message);
  }
}

function serveStatic(req, res) {
  const requestUrl = parseUrl(req);
  const rawPath = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
  const filePath = path.normalize(path.join(DIST_DIR, rawPath));

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(DIST_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Build the app first.");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(fallback);
      });
      return;
    }

    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon"
    };

    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      handleApi(req, res);
      return;
    }

    serveStatic(req, res);
  })
  .listen(PORT, HOST, () => {
    console.log(`Oracle VPS File Manager running at http://${HOST}:${PORT}`);
    console.log(`Project folder: ${__dirname}`);
    console.log(`File root: ${FILE_ROOT}`);
    console.log(ADMIN_PASSWORD ? `Login user: ${ADMIN_USER}` : "ADMIN_PASSWORD is not set. The UI will not allow login.");
  });
