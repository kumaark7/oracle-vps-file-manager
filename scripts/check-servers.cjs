const fs = require("fs");
const fsp = require("fs/promises");
const { spawn } = require("child_process");
const {
  LOCAL_SERVER_ID,
  getServers
} = require("../server/servers.cjs");

const CONNECT_TIMEOUT_MS = 8_000;

function printResult(name, result) {
  console.log(`${name.padEnd(18)} ${result}`);
}

async function checkKey(server) {
  let stats;

  try {
    stats = await fsp.stat(server.keyPath);
  } catch (error) {
    if (error.code === "ENOENT") return "KEY FILE NOT FOUND";
    return "KEY FILE UNREADABLE";
  }

  if (!stats.isFile()) return "KEY PATH IS NOT A FILE";

  try {
    await fsp.access(server.keyPath, fs.constants.R_OK);
  } catch {
    return "KEY FILE UNREADABLE";
  }

  if (process.platform !== "win32") {
    const mode = stats.mode & 0o777;
    if ((mode & 0o077) !== 0) {
      return `KEY PERMISSIONS ${mode.toString(8)}; REMOVE GROUP/OTHER ACCESS`;
    }
  }

  return null;
}

function checkConnection(server) {
  const args = [
    "-i", server.keyPath,
    "-p", String(server.port),
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=accept-new",
    `${server.username}@${server.host}`,
    "true"
  ];

  return new Promise((resolve) => {
    const child = spawn("ssh", args, {
      stdio: "ignore",
      windowsHide: true
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve("SSH CONNECTION TIMED OUT");
    }, CONNECT_TIMEOUT_MS);

    child.once("error", () => {
      clearTimeout(timeout);
      resolve("SSH CLIENT FAILED");
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0 ? null : "SSH CONNECTION FAILED");
    });
  });
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const connect = argumentsList.includes("--connect");

  if (argumentsList.some((argument) => argument !== "--connect")) {
    console.error("Usage: node scripts/check-servers.cjs [--connect]");
    process.exitCode = 1;
    return;
  }

  console.log("VPS Manager Server Check");
  console.log("");

  let servers;
  try {
    servers = await getServers();
  } catch (error) {
    console.error(`Configuration INVALID: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  let failed = false;

  for (const server of servers) {
    if (server.id === LOCAL_SERVER_ID) {
      printResult(server.name, "OK");
      continue;
    }

    const keyError = await checkKey(server);
    const connectionError = !keyError && connect
      ? await checkConnection(server)
      : null;
    const error = keyError || connectionError;

    printResult(server.name, error || "OK");
    failed ||= Boolean(error);
  }

  if (!connect) {
    console.log("");
    console.log("Use --connect to include SSH connectivity checks.");
  }

  if (failed) process.exitCode = 1;
}

main().catch(() => {
  console.error("Server check failed unexpectedly");
  process.exitCode = 1;
});
