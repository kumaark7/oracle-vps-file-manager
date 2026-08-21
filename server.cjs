const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || "127.0.0.1";
const DIST_DIR = path.join(__dirname, "dist");
const DEFAULT_FILE_ROOT =
  process.env.FILE_ROOT ||
  process.env.HOME ||
  process.env.USERPROFILE ||
  (process.platform === "win32" ? __dirname : "/home/ubuntu");
const FILE_ROOT = path.resolve(DEFAULT_FILE_ROOT);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 150 * 1024 * 1024;
const MAX_PROCESS_BYTES = 220 * 1024 * 1024;
const COMMENTS_PATH = process.env.OVFM_COMMENTS_PATH || path.join(os.homedir(), ".oracle-vps-file-manager-comments.json");
const SERVERS_PATH = process.env.OVFM_SERVERS_PATH || path.join(__dirname, ".ovfm-servers.json");
const LOCAL_SERVER_ID = "local";
const sessions = new Map();

const IST_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const REMOTE_PYTHON = String.raw`
import base64
import json
import os
import shutil
import stat
import sys
from pathlib import Path

operation = sys.argv[1]
root = os.path.realpath(sys.argv[2])
payload = json.loads(sys.stdin.read() or "{}")

def fail(message):
    sys.stderr.write(json.dumps({"error": message}))
    sys.exit(1)

def safe_name(name):
    clean = str(name or "").strip()
    if not clean or "/" in clean or "\\" in clean or "\x00" in clean or clean in (".", ".."):
        fail("Invalid file or folder name")
    return clean

def resolve_remote_path(remote_path="/"):
    requested = str(remote_path or "/").replace("\\", "/")
    if "\x00" in requested:
        fail("Invalid path")
    relative = requested[1:] if requested.startswith("/") else requested
    absolute = os.path.realpath(os.path.join(root, relative))
    if absolute != root and not absolute.startswith(root + os.sep):
        fail("Path is outside the configured file root")
    return absolute

def to_remote_path(absolute):
    relative = os.path.relpath(absolute, root).replace("\\", "/")
    return "/" if relative == "." else "/" + relative

def parent_remote_path(remote_path):
    if not remote_path or remote_path == "/":
        return "/"
    clean = remote_path.rstrip("/")
    index = clean.rfind("/")
    return "/" if index <= 0 else clean[:index]

def mode_string(st_mode):
    return stat.filemode(st_mode)

def detect_category(file_name):
    extension = Path(file_name).suffix.lower()
    if extension in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"}:
        return "images"
    if extension in {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}:
        return "videos"
    if extension in {".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".xls", ".xlsx", ".csv", ".ppt", ".pptx"}:
        return "documents"
    return "others"

def scan_usage(target_path):
    try:
        st = os.lstat(target_path)
    except FileNotFoundError:
        return {"totalSize": 0, "categories": {"documents": 0, "images": 0, "videos": 0, "others": 0}}

    if stat.S_ISLNK(st.st_mode):
        return {"totalSize": 0, "categories": {"documents": 0, "images": 0, "videos": 0, "others": 0}}

    if stat.S_ISREG(st.st_mode):
        category = detect_category(target_path)
        return {
            "totalSize": st.st_size,
            "categories": {
                "documents": st.st_size if category == "documents" else 0,
                "images": st.st_size if category == "images" else 0,
                "videos": st.st_size if category == "videos" else 0,
                "others": st.st_size if category == "others" else 0
            }
        }

    if not stat.S_ISDIR(st.st_mode):
        return {
            "totalSize": st.st_size,
            "categories": {"documents": 0, "images": 0, "videos": 0, "others": st.st_size}
        }

    total = {"totalSize": 0, "categories": {"documents": 0, "images": 0, "videos": 0, "others": 0}}
    try:
        with os.scandir(target_path) as children:
            for child in children:
                try:
                    nested = scan_usage(child.path)
                except Exception:
                    continue
                total["totalSize"] += nested["totalSize"]
                for key in total["categories"]:
                    total["categories"][key] += nested["categories"][key]
    except Exception:
        pass
    return total

def resolve_conflict_path(target_path):
    if not os.path.exists(target_path):
        return target_path

    directory = os.path.dirname(target_path)
    extension = Path(target_path).suffix
    basename = Path(target_path).stem

    for index in range(1, 1000):
        suffix = " copy" if index == 1 else f" copy {index}"
        candidate = os.path.join(directory, basename + suffix + extension)
        if not os.path.exists(candidate):
            return candidate

    fail(f"Could not find a free name for {os.path.basename(target_path)}")

def remove_path(remote_path):
    if remote_path == "/":
        fail("Refusing to delete the configured file root")
    absolute = resolve_remote_path(remote_path)
    if os.path.islink(absolute) or os.path.isfile(absolute):
        os.remove(absolute)
    elif os.path.isdir(absolute):
        shutil.rmtree(absolute)
    else:
        os.remove(absolute)

def copy_path(from_path, destination_directory):
    source = resolve_remote_path(from_path)
    target = resolve_conflict_path(os.path.join(destination_directory, os.path.basename(source)))
    if os.path.isdir(source) and not os.path.islink(source):
        shutil.copytree(source, target, symlinks=True)
    else:
        shutil.copy2(source, target, follow_symlinks=False)

def move_path(from_path, destination_directory):
    source = resolve_remote_path(from_path)
    target = resolve_conflict_path(os.path.join(destination_directory, os.path.basename(source)))
    try:
        os.rename(source, target)
    except OSError:
        copy_path(from_path, destination_directory)
        remove_path(from_path)

try:
    if operation == "list":
        absolute = resolve_remote_path(payload.get("path", "/"))
        entries = []
        with os.scandir(absolute) as dirents:
            for dirent in dirents:
                full = os.path.join(absolute, dirent.name)
                st = os.lstat(full)
                if stat.S_ISDIR(st.st_mode):
                    entry_type = "directory"
                elif stat.S_ISLNK(st.st_mode):
                    entry_type = "link"
                else:
                    entry_type = "file"
                entries.append({
                    "name": dirent.name,
                    "path": to_remote_path(full),
                    "type": entry_type,
                    "size": st.st_size,
                    "mode": mode_string(st.st_mode),
                    "modifiedTs": st.st_mtime
                })
        print(json.dumps({"root": root, "path": to_remote_path(absolute), "entries": entries}))
    elif operation == "details":
        remote_path = payload.get("path")
        absolute = resolve_remote_path(remote_path)
        st = os.stat(absolute)
        print(json.dumps({
            "name": os.path.basename(absolute),
            "type": "Directory" if stat.S_ISDIR(st.st_mode) else "File",
            "size": st.st_size,
            "location": parent_remote_path(remote_path),
            "path": absolute,
            "modifiedTs": st.st_mtime,
            "lastUsedTs": st.st_atime,
            "createdTs": getattr(st, "st_birthtime", st.st_ctime)
        }))
    elif operation == "storage":
        statv = os.statvfs(root)
        total_space = statv.f_blocks * statv.f_frsize
        available_space = statv.f_bavail * statv.f_frsize
        used_space = (statv.f_blocks - statv.f_bfree) * statv.f_frsize
        projects = []
        with os.scandir(root) as entries:
            for entry in entries:
                usage = scan_usage(entry.path)
                projects.append({
                    "name": entry.name,
                    "type": "folder" if entry.is_dir(follow_symlinks=False) else "file",
                    "size": usage["totalSize"],
                    "path": to_remote_path(entry.path)
                })
        root_usage = scan_usage(root)
        projects.sort(key=lambda item: item["size"], reverse=True)
        print(json.dumps({
            "totalSpace": total_space,
            "usedSpace": used_space,
            "availableSpace": available_space,
            "categories": root_usage["categories"],
            "projects": projects,
            "topProjects": projects[:8]
        }))
    elif operation == "read":
        absolute = resolve_remote_path(payload.get("path"))
        with open(absolute, "rb") as file_handle:
            content = base64.b64encode(file_handle.read()).decode("ascii")
        print(json.dumps({"content": content}))
    elif operation == "write":
        absolute = resolve_remote_path(payload.get("path"))
        os.makedirs(os.path.dirname(absolute), exist_ok=True)
        content = base64.b64decode((payload.get("content") or "").encode("ascii"))
        with open(absolute, "wb") as file_handle:
            file_handle.write(content)
        print(json.dumps({"ok": True}))
    elif operation == "mkdir":
        requested_path = payload.get("path")
        parent = resolve_remote_path(parent_remote_path(requested_path))
        folder_name = safe_name(Path(requested_path).name)
        os.makedirs(os.path.join(parent, folder_name), exist_ok=True)
        print(json.dumps({"ok": True}))
    elif operation == "rename":
        source = resolve_remote_path(payload.get("from"))
        destination_parent = resolve_remote_path(parent_remote_path(payload.get("to")))
        destination_name = safe_name(Path(payload.get("to")).name)
        os.rename(source, os.path.join(destination_parent, destination_name))
        print(json.dumps({"ok": True}))
    elif operation == "delete":
        remove_path(payload.get("path"))
        print(json.dumps({"ok": True}))
    elif operation == "delete_bulk":
        for item_path in payload.get("paths", []):
            remove_path(item_path)
        print(json.dumps({"ok": True}))
    elif operation == "paste":
        destination_directory = resolve_remote_path(payload.get("destination", "/"))
        items = payload.get("items", [])
        if not items:
            fail("No items selected")
        operation_name = "cut" if payload.get("operation") == "cut" else "copy"
        for item_path in items:
            if operation_name == "cut":
                move_path(item_path, destination_directory)
            else:
                copy_path(item_path, destination_directory)
        print(json.dumps({"ok": True}))
    else:
        fail("Unknown operation")
except Exception as error:
    fail(str(error))
`;

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

function formatDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) return "";
  return IST_FORMATTER.format(value).replace(",", "");
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return formatDate(new Date(timestamp * 1000));
}

function normalizeServerId(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || null;
}

function buildLocalServer() {
  const localUsername = process.env.OVFM_LOCAL_SERVER_USER || process.env.USER || process.env.USERNAME || os.userInfo().username || "user";
  const isWindowsLocal = process.platform === "win32";
  return {
    id: LOCAL_SERVER_ID,
    name: process.env.OVFM_LOCAL_SERVER_NAME || (isWindowsLocal ? "This Computer" : "Primary VPS"),
    kind: "local",
    host: process.env.OVFM_PUBLIC_HOST || (isWindowsLocal ? "127.0.0.1" : "files.projectdarkhope.xyz"),
    port: 22,
    username: localUsername,
    rootPath: FILE_ROOT,
    description: isWindowsLocal ? "Hosted locally on this computer" : "Hosted on this VPS"
  };
}

async function readServerConfigFile() {
  try {
    return JSON.parse(await fsp.readFile(SERVERS_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function sanitizeServerConfig(rawServer, index) {
  if (!rawServer || typeof rawServer !== "object") {
    throw new Error(`Invalid server configuration at index ${index}`);
  }

  const id = normalizeServerId(rawServer.id || rawServer.name || `server-${index + 1}`);
  const kind = rawServer.kind === "local" ? "local" : "ssh";

  if (kind === "local") {
    throw new Error("Only the built-in local server can use kind=local");
  }

  if (!rawServer.host || !rawServer.username || !rawServer.keyPath) {
    throw new Error(`Server ${id} must include host, username, and keyPath`);
  }

  return {
    id,
    name: String(rawServer.name || id),
    kind,
    host: String(rawServer.host),
    port: Number(rawServer.port || 22),
    username: String(rawServer.username),
    keyPath: String(rawServer.keyPath),
    rootPath: path.posix.normalize(String(rawServer.rootPath || `/home/${rawServer.username}`)),
    description: String(rawServer.description || `Remote server ${rawServer.host}`)
  };
}

async function getServers() {
  const configured = await readServerConfigFile();
  const remoteServers = Array.isArray(configured) ? configured : Array.isArray(configured.servers) ? configured.servers : [];
  return [buildLocalServer(), ...remoteServers.map(sanitizeServerConfig)];
}

async function getServer(serverId) {
  const targetId = normalizeServerId(serverId) || LOCAL_SERVER_ID;
  const servers = await getServers();
  const server = servers.find((item) => item.id === targetId);
  if (!server) throw new Error(`Unknown server: ${targetId}`);
  return server;
}

function publicServer(server) {
  return {
    id: server.id,
    name: server.name,
    kind: server.kind,
    host: server.host,
    port: server.port,
    username: server.username,
    rootPath: server.rootPath,
    description: server.description
  };
}

function resolveRemotePath(rootPath, inputPath = "/") {
  const requested = String(inputPath || "/").replace(/\\/g, "/");
  if (requested.includes("\0")) throw new Error("Invalid path");

  const relative = requested.startsWith("/") ? requested.slice(1) : requested;
  const absolute = path.resolve(rootPath, relative);

  if (absolute !== rootPath && !absolute.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("Path is outside the configured file root");
  }

  return absolute;
}

function toRemotePath(rootPath, absolute) {
  const relative = path.relative(rootPath, absolute).replace(/\\/g, "/");
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
  await fsp.writeFile(COMMENTS_PATH, JSON.stringify(comments, null, 2), { mode: 0o600 });
}

function commentKey(serverId, remotePath) {
  return `${serverId}:${remotePath}`;
}

async function getComment(serverId, remotePath) {
  const comments = await readComments();
  return comments[commentKey(serverId, remotePath)] || "";
}

async function setComment(serverId, remotePath, comment) {
  const comments = await readComments();
  const trimmed = String(comment || "").trim();
  const key = commentKey(serverId, remotePath);

  if (trimmed) {
    comments[key] = trimmed;
  } else {
    delete comments[key];
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

function modeString(mode, isDirectory, isSymbolicLink) {
  const kind = isDirectory ? "d" : isSymbolicLink ? "l" : "-";
  const flags = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001];
  return kind + flags.map((flag, index) => (mode & flag ? "rwx"[index % 3] : "-")).join("");
}

async function listLocalFiles(server, remotePath) {
  const absolute = resolveRemotePath(server.rootPath, remotePath);
  const dirents = await fsp.readdir(absolute, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (dirent) => {
      const full = path.join(absolute, dirent.name);
      const stats = await fsp.lstat(full);
      return {
        name: dirent.name,
        path: toRemotePath(server.rootPath, full),
        type: dirent.isDirectory() ? "directory" : dirent.isSymbolicLink() ? "link" : "file",
        size: stats.size,
        mode: modeString(stats.mode, dirent.isDirectory(), dirent.isSymbolicLink()),
        modifiedTs: stats.mtimeMs / 1000
      };
    })
  );

  return { root: server.rootPath, path: toRemotePath(server.rootPath, absolute), entries };
}

async function getLocalDetails(server, remotePath) {
  const absolute = resolveRemotePath(server.rootPath, remotePath);
  const stats = await fsp.stat(absolute);
  return {
    name: path.basename(absolute),
    type: stats.isDirectory() ? "Directory" : "File",
    size: stats.size,
    location: parentRemotePath(remotePath),
    path: absolute,
    modifiedTs: stats.mtimeMs / 1000,
    lastUsedTs: stats.atimeMs / 1000,
    createdTs: stats.birthtimeMs / 1000
  };
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
  const nested = await Promise.all(
    children.map(async (child) => {
      try {
        return await scanUsage(path.join(absolutePath, child.name));
      } catch {
        return { totalSize: 0, categories: { documents: 0, images: 0, videos: 0, others: 0 } };
      }
    })
  );

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

async function getLocalStorageSummary(server) {
  const stat = await fsp.statfs(server.rootPath);
  const blockSize = stat.bsize || stat.frsize || 4096;
  const totalSpace = stat.blocks * blockSize;
  const availableSpace = stat.bavail * blockSize;
  const usedSpace = totalSpace - stat.bfree * blockSize;
  const entries = await fsp.readdir(server.rootPath, { withFileTypes: true });

  const projects = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(server.rootPath, entry.name);
      const usage = await scanUsage(absolute);
      return {
        name: entry.name,
        type: entry.isDirectory() ? "folder" : "file",
        size: usage.totalSize,
        path: toRemotePath(server.rootPath, absolute)
      };
    })
  );

  const rootUsage = await scanUsage(server.rootPath);
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

async function removeLocalPath(server, remotePath) {
  if (remotePath === "/") throw new Error("Refusing to delete the configured file root");
  await fsp.rm(resolveRemotePath(server.rootPath, remotePath), { recursive: true, force: true });
}

async function copyLocalPath(server, fromPath, destinationDirectory) {
  const source = resolveRemotePath(server.rootPath, fromPath);
  const target = await resolveConflictPath(path.join(destinationDirectory, path.basename(source)));
  await fsp.cp(source, target, { recursive: true, errorOnExist: true });
}

async function moveLocalPath(server, fromPath, destinationDirectory) {
  const source = resolveRemotePath(server.rootPath, fromPath);
  const target = await resolveConflictPath(path.join(destinationDirectory, path.basename(source)));

  try {
    await fsp.rename(source, target);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await fsp.cp(source, target, { recursive: true, errorOnExist: true });
    await fsp.rm(source, { recursive: true, force: true });
  }
}

async function readLocalFile(server, remotePath) {
  const absolute = resolveRemotePath(server.rootPath, remotePath);
  const content = await fsp.readFile(absolute);
  return { content: content.toString("base64") };
}

async function writeLocalFile(server, remotePath, content) {
  const absolute = resolveRemotePath(server.rootPath, remotePath);
  await fsp.mkdir(path.dirname(absolute), { recursive: true });
  await fsp.writeFile(absolute, Buffer.from(String(content || ""), "base64"));
  return { ok: true };
}

async function mkdirLocal(server, remotePath) {
  await fsp.mkdir(path.join(resolveRemotePath(server.rootPath, parentRemotePath(remotePath)), safeName(path.posix.basename(remotePath))), { recursive: true });
  return { ok: true };
}

async function renameLocal(server, fromPath, toPath) {
  const from = resolveRemotePath(server.rootPath, fromPath);
  const toParent = resolveRemotePath(server.rootPath, parentRemotePath(toPath));
  await fsp.rename(from, path.join(toParent, safeName(path.posix.basename(toPath))));
  return { ok: true };
}

async function deleteBulkLocal(server, paths) {
  await Promise.all(paths.map((itemPath) => removeLocalPath(server, itemPath)));
  return { ok: true };
}

async function pasteLocal(server, body) {
  const destinationDirectory = resolveRemotePath(server.rootPath, body.destination || "/");
  const items = Array.isArray(body.items) ? body.items : [];
  const operation = body.operation === "cut" ? "cut" : "copy";

  if (!items.length) throw new Error("No items selected");

  for (const itemPath of items) {
    if (operation === "cut") {
      await moveLocalPath(server, itemPath, destinationDirectory);
    } else {
      await copyLocalPath(server, itemPath, destinationDirectory);
    }
  }

  return { ok: true };
}

function runProcess(filePath, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(filePath, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_PROCESS_BYTES) {
        child.kill("SIGTERM");
        reject(new Error("Remote response is too large"));
        return;
      }
      stdout.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_PROCESS_BYTES) {
        child.kill("SIGTERM");
        reject(new Error("Remote error output is too large"));
        return;
      }
      stderr.push(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      const stdoutText = Buffer.concat(stdout).toString("utf8");
      const stderrText = Buffer.concat(stderr).toString("utf8");

      if (code !== 0) {
        let message = stderrText.trim() || stdoutText.trim() || `Process exited with code ${code}`;
        try {
          const parsed = JSON.parse(stderrText || stdoutText);
          if (parsed?.error) message = parsed.error;
        } catch {}
        reject(new Error(message));
        return;
      }

      resolve(stdoutText);
    });

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
}

async function runRemoteOperation(server, operation, payload = {}) {
  const remoteCommand = ["python3", "-c", REMOTE_PYTHON, operation, server.rootPath]
    .map(shellQuote)
    .join(" ");
  const args = [
    "-i",
    server.keyPath,
    "-p",
    String(server.port || 22),
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    `${server.username}@${server.host}`,
    remoteCommand
  ];

  const stdoutText = await runProcess("ssh", args, JSON.stringify(payload));

  try {
    return JSON.parse(stdoutText || "{}");
  } catch {
    throw new Error("Remote server returned invalid data");
  }
}

function normalizeListResult(result) {
  return {
    root: result.root,
    path: result.path,
    entries: Array.isArray(result.entries)
      ? result.entries.map((entry) => ({
          ...entry,
          modified: normalizeTimestamp(entry.modifiedTs)
        }))
      : []
  };
}

async function listFiles(server, remotePath) {
  return normalizeListResult(server.kind === "local" ? await listLocalFiles(server, remotePath) : await runRemoteOperation(server, "list", { path: remotePath }));
}

async function getDetails(server, remotePath) {
  const result = server.kind === "local" ? await getLocalDetails(server, remotePath) : await runRemoteOperation(server, "details", { path: remotePath });
  const comment = await getComment(server.id, remotePath);

  return {
    name: result.name,
    type: result.type,
    size: result.size,
    location: result.location,
    path: result.path,
    modified: normalizeTimestamp(result.modifiedTs),
    lastUsed: normalizeTimestamp(result.lastUsedTs),
    created: normalizeTimestamp(result.createdTs),
    comment
  };
}

async function getStorageSummary(server) {
  return server.kind === "local" ? getLocalStorageSummary(server) : runRemoteOperation(server, "storage");
}

async function readFileContent(server, remotePath) {
  return server.kind === "local" ? readLocalFile(server, remotePath) : runRemoteOperation(server, "read", { path: remotePath });
}

async function writeFileContent(server, remotePath, content) {
  return server.kind === "local"
    ? writeLocalFile(server, remotePath, content)
    : runRemoteOperation(server, "write", { path: remotePath, content });
}

async function mkdir(server, remotePath) {
  return server.kind === "local" ? mkdirLocal(server, remotePath) : runRemoteOperation(server, "mkdir", { path: remotePath });
}

async function rename(server, fromPath, toPath) {
  return server.kind === "local" ? renameLocal(server, fromPath, toPath) : runRemoteOperation(server, "rename", { from: fromPath, to: toPath });
}

async function removePath(server, remotePath) {
  return server.kind === "local" ? removeLocalPath(server, remotePath) : runRemoteOperation(server, "delete", { path: remotePath });
}

async function deleteBulk(server, paths) {
  return server.kind === "local" ? deleteBulkLocal(server, paths) : runRemoteOperation(server, "delete_bulk", { paths });
}

async function paste(server, body) {
  return server.kind === "local" ? pasteLocal(server, body) : runRemoteOperation(server, "paste", body);
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
  sendJson(res, 200, { ok: true, username: ADMIN_USER });
}

function getServerId(requestUrl, body) {
  return requestUrl.searchParams.get("serverId") || body?.serverId || LOCAL_SERVER_ID;
}

async function handleApi(req, res) {
  try {
    const requestUrl = parseUrl(req);

    if (req.method === "GET" && requestUrl.pathname === "/api/session") {
      sendJson(res, 200, {
        authenticated: verifySession(req),
        username: ADMIN_USER,
        passwordConfigured: Boolean(ADMIN_PASSWORD),
        defaultServerId: LOCAL_SERVER_ID
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

    if (req.method === "GET" && requestUrl.pathname === "/api/servers") {
      const servers = await getServers();
      sendJson(res, 200, { servers: servers.map(publicServer), defaultServerId: LOCAL_SERVER_ID });
      return;
    }

    const body = req.method === "POST" ? await readBody(req) : {};
    const server = await getServer(getServerId(requestUrl, body));

    if (req.method === "GET" && requestUrl.pathname === "/api/files") {
      sendJson(res, 200, await listFiles(server, requestUrl.searchParams.get("path") || "/"));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/details") {
      sendJson(res, 200, await getDetails(server, requestUrl.searchParams.get("path")));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/storage") {
      sendJson(res, 200, await getStorageSummary(server));
      return;
    }

    if (req.method === "GET" && (requestUrl.pathname === "/api/read" || requestUrl.pathname === "/api/download")) {
      sendJson(res, 200, await readFileContent(server, requestUrl.searchParams.get("path")));
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/mkdir") {
      await mkdir(server, body.path);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/rename") {
      await rename(server, body.from, body.to);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/delete") {
      await removePath(server, body.path);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/comment") {
      await setComment(server.id, body.path, body.comment);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/delete-bulk") {
      const paths = Array.isArray(body.paths) ? body.paths : [];
      if (!paths.length) throw new Error("No items selected");
      await deleteBulk(server, paths);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/paste") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) throw new Error("No items selected");
      await paste(server, { destination: body.destination || "/", items, operation: body.operation });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && (requestUrl.pathname === "/api/upload" || requestUrl.pathname === "/api/save")) {
      await writeFileContent(server, body.path, String(body.content || ""));
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
    console.log(`Local file root: ${FILE_ROOT}`);
    console.log(`Server config path: ${SERVERS_PATH}`);
    console.log(ADMIN_PASSWORD ? `Login user: ${ADMIN_USER}` : "ADMIN_PASSWORD is not set. The UI will not allow login.");
  });
