const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const config = require("../config.cjs");

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

async function ensureAuthDir() {
  await fsp.mkdir(config.authDir, {
    recursive: true,
    mode: DIRECTORY_MODE
  });

  await fsp.chmod(config.authDir, DIRECTORY_MODE);
}

function authPath(filename) {
  const clean = path.basename(String(filename || ""));

  if (!clean || clean !== filename) {
    throw new Error("Invalid auth filename");
  }

  return path.join(config.authDir, clean);
}

async function readJson(filename, fallback = null) {
  await ensureAuthDir();

  const target = authPath(filename);

  try {
    const content = await fsp.readFile(target, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filename, value) {
  await ensureAuthDir();

  const target = authPath(filename);

  const temporary = path.join(
    config.authDir,
    `.${filename}.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  const data = JSON.stringify(value, null, 2) + "\n";

  let handle;

  try {
    handle = await fsp.open(temporary, "wx", FILE_MODE);

    await handle.writeFile(data, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;

    await fsp.rename(temporary, target);
    await fsp.chmod(target, FILE_MODE);

    try {
      const dirHandle = await fsp.open(config.authDir, fs.constants.O_RDONLY);
      await dirHandle.sync();
      await dirHandle.close();
    } catch {
      // Directory fsync is best-effort on platforms that support it.
    }
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }

    await fsp.rm(temporary, { force: true }).catch(() => {});
  }
}

async function deleteFile(filename) {
  await ensureAuthDir();
  await fsp.rm(authPath(filename), { force: true });
}

module.exports = {
  ensureAuthDir,
  readJson,
  writeJson,
  deleteFile
};
