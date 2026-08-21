const fsp = require("fs/promises");
const config = require("../config.cjs");

let writeQueue = Promise.resolve();

async function readComments() {
  try {
    return JSON.parse(await fsp.readFile(config.commentsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function keyFor(serverId, remotePath) {
  return `${serverId}:${remotePath}`;
}

async function getComment(serverId, remotePath) {
  const comments = await readComments();
  return comments[keyFor(serverId, remotePath)] || "";
}

function setComment(serverId, remotePath, comment) {
  writeQueue = writeQueue.then(async () => {
    const comments = await readComments();
    const key = keyFor(serverId, remotePath);
    const value = String(comment || "").trim();
    if (value) comments[key] = value;
    else delete comments[key];
    await fsp.writeFile(config.commentsPath, JSON.stringify(comments, null, 2), { mode: 0o600 });
  });
  return writeQueue;
}

module.exports = { getComment, setComment };
