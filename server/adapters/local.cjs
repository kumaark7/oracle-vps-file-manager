const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const { pipeline } = require("stream/promises");
const { HttpError } = require("../http.cjs");
const { parentPath, resolveRootPath, safeName, toVirtualPath } = require("../path-utils.cjs");
const { scanUsage } = require("../services/storage.cjs");
const { createFolderZipStream } = require("../services/zip.cjs");

function modeString(mode, isDirectory, isSymbolicLink) {
  const kind = isDirectory ? "d" : isSymbolicLink ? "l" : "-";
  const flags = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001];
  return kind + flags.map((flag, index) => (mode & flag ? "rwx"[index % 3] : "-")).join("");
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function conflictPath(targetPath) {
  if (!(await pathExists(targetPath))) return targetPath;
  const directory = path.dirname(targetPath);
  const extension = path.extname(targetPath);
  const basename = path.basename(targetPath, extension);
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? " copy" : ` copy ${index}`;
    const candidate = path.join(directory, `${basename}${suffix}${extension}`);
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new HttpError(409, `Could not find a free name for ${path.basename(targetPath)}`);
}

class LocalAdapter {
  constructor(server) {
    this.server = server;
  }

  resolve(remotePath) {
    return resolveRootPath(this.server.rootPath, remotePath);
  }

  async realRoot() {
    return fsp.realpath(this.server.rootPath);
  }

  async assertInside(absolute) {
    const root = await this.realRoot();
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      throw new HttpError(403, "Path is outside the configured file root");
    }
    return absolute;
  }

  async resolveExisting(remotePath) {
    const lexical = this.resolve(remotePath);
    return this.assertInside(await fsp.realpath(lexical));
  }

  async resolveEntry(remotePath) {
    const lexical = this.resolve(remotePath);
    if (lexical === path.resolve(this.server.rootPath)) return this.realRoot();
    const parent = await this.assertInside(await fsp.realpath(path.dirname(lexical)));
    return path.join(parent, path.basename(lexical));
  }

  async prepareWriteTarget(remotePath) {
    const requested = String(remotePath || "/").replace(/\\/g, "/");
    this.resolve(requested);
    const parts = requested.split("/").filter(Boolean);
    if (!parts.length) throw new HttpError(400, "A file path is required");
    const fileName = safeName(parts.pop());
    const root = await this.realRoot();
    let current = root;

    for (const part of parts) {
      const candidate = path.join(current, safeName(part));
      try {
        const stats = await fsp.lstat(candidate);
        if (!stats.isDirectory() && !stats.isSymbolicLink()) throw new HttpError(400, "Upload path contains a non-directory");
        current = stats.isSymbolicLink() ? await this.assertInside(await fsp.realpath(candidate)) : candidate;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await fsp.mkdir(candidate);
        current = candidate;
      }
    }
    return path.join(current, fileName);
  }

  async list(remotePath = "/") {
    const absolute = await this.resolveExisting(remotePath);
    const dirents = await fsp.readdir(absolute, { withFileTypes: true });
    const entries = [];
    for (const dirent of dirents) {
      const full = path.join(absolute, dirent.name);
      try {
        const stats = await fsp.lstat(full);
        entries.push({
          name: dirent.name,
          path: toVirtualPath(this.server.rootPath, full),
          type: dirent.isDirectory() ? "directory" : dirent.isSymbolicLink() ? "link" : "file",
          size: stats.size,
          mode: modeString(stats.mode, dirent.isDirectory(), dirent.isSymbolicLink()),
          modifiedTs: stats.mtimeMs / 1000
        });
      } catch {
        // Entries may disappear while a directory is being read.
      }
    }
    return { root: this.server.rootPath, path: toVirtualPath(this.server.rootPath, absolute), entries };
  }

  async details(remotePath) {
    const absolute = await this.resolveEntry(remotePath);
    const stats = await fsp.lstat(absolute);
    return {
      name: path.basename(absolute),
      type: stats.isDirectory() ? "Directory" : stats.isSymbolicLink() ? "Link" : "File",
      size: stats.size,
      location: parentPath(remotePath),
      path: absolute,
      modifiedTs: stats.mtimeMs / 1000,
      lastUsedTs: stats.atimeMs / 1000,
      createdTs: stats.birthtimeMs / 1000
    };
  }

  async storage() {
    const stat = await fsp.statfs(this.server.rootPath);
    const blockSize = stat.bsize || stat.frsize || 4096;
    const totalSpace = stat.blocks * blockSize;
    const availableSpace = stat.bavail * blockSize;
    const usedSpace = totalSpace - stat.bfree * blockSize;
    const entries = await fsp.readdir(this.server.rootPath, { withFileTypes: true });
    const projects = [];

    for (const entry of entries) {
      const absolute = path.join(this.server.rootPath, entry.name);
      const usage = await scanUsage(absolute);
      projects.push({
        name: entry.name,
        type: entry.isDirectory() ? "folder" : "file",
        size: usage.totalSize,
        path: toVirtualPath(this.server.rootPath, absolute)
      });
    }

    const rootUsage = await scanUsage(this.server.rootPath);
    projects.sort((first, second) => second.size - first.size);
    return { totalSpace, usedSpace, availableSpace, categories: rootUsage.categories, projects, topProjects: projects.slice(0, 8) };
  }

  async readBuffer(remotePath, maxBytes) {
    const absolute = await this.resolveExisting(remotePath);
    const stats = await fsp.stat(absolute);
    if (!stats.isFile()) throw new HttpError(400, "Only files can be opened");
    if (stats.size > maxBytes) throw new HttpError(413, "File is too large to edit in the browser");
    return fsp.readFile(absolute);
  }

  async download(remotePath) {
    const absolute = await this.resolveExisting(remotePath);
    const stats = await fsp.stat(absolute);
    if (!stats.isFile()) throw new HttpError(400, "Only files can be downloaded");
    return { name: path.basename(absolute), size: stats.size, stream: fs.createReadStream(absolute) };
  }

  async folderSource(remotePath) {
    if (!remotePath || remotePath === "/") throw new HttpError(403, "The configured file root cannot be archived");
    const absolute = await this.resolveEntry(remotePath);
    const stats = await fsp.lstat(absolute);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new HttpError(400, "Only folders can be archived");
    await this.assertInside(await fsp.realpath(absolute));
    return absolute;
  }

  async zipFolder(remotePath) {
    const source = await this.folderSource(remotePath);
    const target = await conflictPath(path.join(path.dirname(source), `${path.basename(source)}.zip`));
    const temporary = path.join(path.dirname(source), `.${path.basename(source)}.${randomUUID()}.zip.tmp`);
    try {
      await pipeline(await createFolderZipStream(source), fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      await fsp.rename(temporary, target);
      return { name: path.basename(target), path: toVirtualPath(this.server.rootPath, target) };
    } finally {
      await fsp.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async downloadFolder(remotePath) {
    const source = await this.folderSource(remotePath);
    return { name: `${path.basename(source)}.zip`, stream: await createFolderZipStream(source) };
  }

  async write(remotePath, readable) {
    const absolute = await this.prepareWriteTarget(remotePath);
    await pipeline(readable, fs.createWriteStream(absolute, { flags: "w", mode: 0o600 }));
    return { ok: true };
  }

  async mkdir(remotePath) {
    const parent = await this.resolveExisting(parentPath(remotePath));
    await fsp.mkdir(path.join(parent, safeName(path.posix.basename(remotePath))), { recursive: true });
    return { ok: true };
  }

  async rename(fromPath, toPath) {
    const source = await this.resolveEntry(fromPath);
    const destinationParent = await this.resolveExisting(parentPath(toPath));
    await fsp.rename(source, path.join(destinationParent, safeName(path.posix.basename(toPath))));
    return { ok: true };
  }

  async remove(remotePath) {
    if (remotePath === "/") throw new HttpError(403, "Refusing to delete the configured file root");
    await fsp.rm(await this.resolveEntry(remotePath), { recursive: true, force: false });
    return { ok: true };
  }

  async deleteBulk(paths) {
    for (const remotePath of paths) await this.remove(remotePath);
    return { ok: true };
  }

  async paste({ destination = "/", items = [], operation = "copy" }) {
    if (!items.length) throw new HttpError(400, "No items selected");
    const destinationDirectory = await this.resolveExisting(destination);
    for (const itemPath of items) {
      const source = await this.resolveEntry(itemPath);
      const target = await conflictPath(path.join(destinationDirectory, path.basename(source)));
      if (operation === "cut") {
        try {
          await fsp.rename(source, target);
        } catch (error) {
          if (error.code !== "EXDEV") throw error;
          await fsp.cp(source, target, { recursive: true, errorOnExist: true, verbatimSymlinks: true });
          await fsp.rm(source, { recursive: true, force: false });
        }
      } else {
        await fsp.cp(source, target, { recursive: true, errorOnExist: true, verbatimSymlinks: true });
      }
    }
    return { ok: true };
  }
}

module.exports = { LocalAdapter };
