const fs = require("fs");
const { spawn } = require("child_process");
const { PassThrough } = require("stream");
const { pipeline } = require("stream/promises");
const config = require("../config.cjs");
const { HttpError } = require("../http.cjs");

const agentSource = fs.readFileSync(config.remoteAgentPath, "utf8");

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function encodedPayload(payload) {
  return Buffer.from(JSON.stringify(payload || {}), "utf8").toString("base64url");
}

function parseRemoteError(stderr, fallback) {
  const text = Buffer.concat(stderr).toString("utf8").trim();
  try {
    return JSON.parse(text).error || fallback;
  } catch {
    return text || fallback;
  }
}

class SshAdapter {
  constructor(server) {
    this.server = server;
  }

  spawnAgent(operation, payload = {}) {
    const remoteCommand = ["python3", "-c", agentSource, operation, this.server.rootPath, encodedPayload(payload)]
      .map(shellQuote)
      .join(" ");
    const args = [
      "-i", this.server.keyPath,
      "-p", String(this.server.port),
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=15",
      "-o", "StrictHostKeyChecking=accept-new",
      `${this.server.username}@${this.server.host}`,
      remoteCommand
    ];
    return spawn("ssh", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  }

  waitForProcess(child, options = {}) {
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const collectStdout = options.collectStdout !== false;

    if (collectStdout) {
      child.stdout.on("data", (chunk) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > config.maxProcessBytes) child.kill("SIGTERM");
        else stdout.push(chunk);
      });
    }
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 1024 * 1024) child.kill("SIGTERM");
      else stderr.push(chunk);
    });

    return new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        if (stdoutBytes > config.maxProcessBytes) return reject(new HttpError(413, "Remote response is too large"));
        if (stderrBytes > 1024 * 1024) return reject(new HttpError(502, "Remote error output is too large"));
        if (code !== 0) return reject(new HttpError(502, parseRemoteError(stderr, `SSH process exited with code ${code}`)));
        resolve(Buffer.concat(stdout));
      });
    });
  }

  async runJson(operation, payload = {}) {
    const child = this.spawnAgent(operation, payload);
    child.stdin.end();
    const output = await this.waitForProcess(child);
    try {
      return JSON.parse(output.toString("utf8") || "{}");
    } catch {
      throw new HttpError(502, "Remote server returned invalid data");
    }
  }

  list(remotePath) { return this.runJson("list", { path: remotePath }); }
  details(remotePath) { return this.runJson("details", { path: remotePath }); }
  storage() { return this.runJson("storage"); }
  mkdir(remotePath) { return this.runJson("mkdir", { path: remotePath }); }
  rename(fromPath, toPath) { return this.runJson("rename", { from: fromPath, to: toPath }); }
  remove(remotePath) { return this.runJson("delete", { path: remotePath }); }
  deleteBulk(paths) { return this.runJson("delete_bulk", { paths }); }
  paste(payload) { return this.runJson("paste", payload); }

  async readBuffer(remotePath, maxBytes) {
    const details = await this.details(remotePath);
    if (details.type !== "File") throw new HttpError(400, "Only files can be opened");
    if (details.size > maxBytes) throw new HttpError(413, "File is too large to edit in the browser");
    const child = this.spawnAgent("read_stream", { path: remotePath });
    child.stdin.end();
    return this.waitForProcess(child);
  }

  async download(remotePath) {
    const details = await this.details(remotePath);
    if (details.type !== "File") throw new HttpError(400, "Only files can be downloaded");
    const child = this.spawnAgent("read_stream", { path: remotePath });
    child.stdin.end();
    const stream = new PassThrough();
    child.stdout.pipe(stream);
    const done = this.waitForProcess(child, { collectStdout: false });
    done.catch((error) => stream.destroy(error));
    return { name: details.name, size: details.size, stream, done };
  }

  async write(remotePath, readable) {
    const child = this.spawnAgent("write_stream", { path: remotePath });
    const done = this.waitForProcess(child);
    await pipeline(readable, child.stdin);
    await done;
    return { ok: true };
  }
}

module.exports = { SshAdapter };
