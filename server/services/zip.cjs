const fsp = require("fs/promises");
const path = require("path");
const yazl = require("yazl");

function archivePath(...parts) {
  return parts.filter(Boolean).join("/").replace(/\\/g, "/");
}

async function addFolder(zipFile, sourcePath, rootName) {
  const pending = [{ absolute: sourcePath, archive: rootName }];

  while (pending.length) {
    const current = pending.pop();
    const stats = await fsp.lstat(current.absolute);
    if (stats.isSymbolicLink()) continue;

    if (stats.isDirectory()) {
      zipFile.addEmptyDirectory(`${current.archive}/`, { mtime: stats.mtime, mode: stats.mode });
      const children = await fsp.readdir(current.absolute);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const name = children[index];
        pending.push({
          absolute: path.join(current.absolute, name),
          archive: archivePath(current.archive, name)
        });
      }
    } else if (stats.isFile()) {
      zipFile.addFile(current.absolute, current.archive, { mtime: stats.mtime, mode: stats.mode });
    }
  }
}

async function createFolderZipStream(sourcePath) {
  const zipFile = new yazl.ZipFile();
  await addFolder(zipFile, sourcePath, path.basename(sourcePath));
  zipFile.end();
  return zipFile.outputStream;
}

module.exports = { createFolderZipStream };
