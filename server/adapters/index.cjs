const { LocalAdapter } = require("./local.cjs");
const { SshAdapter } = require("./ssh.cjs");

function getServerAdapter(server) {
  return server.kind === "local" ? new LocalAdapter(server) : new SshAdapter(server);
}

module.exports = { getServerAdapter };
