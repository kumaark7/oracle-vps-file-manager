const os = require("os");
const pty = require("node-pty");

const COMMON_ENVIRONMENT = ["HOME", "USER", "LOGNAME", "SHELL", "PATH", "TERM", "LANG", "COLORTERM"];
const WINDOWS_ENVIRONMENT = ["SystemRoot", "ComSpec", "PATHEXT", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "TEMP", "TMP", "USERNAME"];

function sanitizedTerminalEnvironment(source = process.env, platform = process.platform) {
  const allowed = new Set(COMMON_ENVIRONMENT.map((key) => key.toUpperCase()));
  if (platform === "win32") WINDOWS_ENVIRONMENT.forEach((key) => allowed.add(key.toUpperCase()));

  const environment = {};
  for (const [key, value] of Object.entries(source)) {
    const normalized = key.toUpperCase();
    if ((allowed.has(normalized) || normalized.startsWith("LC_")) && value !== undefined) {
      environment[key] = String(value);
    }
  }

  environment.TERM = "xterm-256color";
  environment.COLORTERM = "truecolor";
  if (!environment.HOME && platform !== "win32") environment.HOME = os.homedir();
  return environment;
}

function localShell(platform = process.platform, environment = process.env) {
  if (platform === "win32") return environment.ComSpec && /powershell/i.test(environment.ComSpec) ? environment.ComSpec : "powershell.exe";
  return environment.SHELL || "/bin/bash";
}

function spawnLocalTerminal({ cwd, cols, rows }) {
  const shell = localShell();
  const args = process.platform === "win32" ? ["-NoLogo"] : ["-l"];
  return pty.spawn(shell, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: sanitizedTerminalEnvironment(),
    handleFlowControl: true
  });
}

module.exports = { localShell, sanitizedTerminalEnvironment, spawnLocalTerminal };

