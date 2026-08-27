const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const pty = require("node-pty");
const { sanitizedTerminalEnvironment } = require("./local.cjs");

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

async function spawnSshTerminal({ server, cwd, cols, rows }) {
  await fsp.access(server.keyPath, fs.constants.R_OK);

  const remoteCommand = `cd -- ${shellQuote(cwd)} && exec "\${SHELL:-/bin/bash}" -l`;
  const args = [
    "-tt",
    "-i", server.keyPath,
    "-p", String(server.port),
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=15",
    "-o", "ServerAliveInterval=25",
    "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "LogLevel=ERROR",
    `${server.username}@${server.host}`,
    remoteCommand
  ];

  return pty.spawn("ssh", args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: os.homedir(),
    env: sanitizedTerminalEnvironment(),
    handleFlowControl: true
  });
}

module.exports = { shellQuote, spawnSshTerminal };
