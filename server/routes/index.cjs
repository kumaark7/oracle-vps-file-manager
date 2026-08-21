const config = require("../config.cjs");
const { requireAuth } = require("../auth.cjs");
const { getServer, getServers, LOCAL_SERVER_ID, publicServer } = require("../servers.cjs");
const { getServerAdapter } = require("../adapters/index.cjs");
const { HttpError, parseUrl, sendError, sendJson } = require("../http.cjs");
const { handleAuthRoute } = require("./auth.cjs");
const { handleFilesRoute } = require("./files.cjs");
const { handleStorageRoute } = require("./storage.cjs");

function verifySameOrigin(req) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.origin;
  if (!origin) return;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Invalid request origin");
  }
  if (originHost !== req.headers.host) throw new HttpError(403, "Cross-origin requests are not allowed");
}

async function handleApi(req, res) {
  try {
    const requestUrl = parseUrl(req);
    verifySameOrigin(req);
    if (await handleAuthRoute(req, res, requestUrl)) return;

    requireAuth(req);
    if (req.method === "GET" && requestUrl.pathname === "/api/servers") {
      const servers = await getServers();
      sendJson(res, 200, { servers: servers.map(publicServer), defaultServerId: LOCAL_SERVER_ID });
      return;
    }

    const server = await getServer(requestUrl.searchParams.get("serverId") || LOCAL_SERVER_ID);
    const adapter = getServerAdapter(server);
    if (await handleStorageRoute(req, res, requestUrl, adapter)) return;
    if (await handleFilesRoute(req, res, requestUrl, server, adapter)) return;
    throw new HttpError(404, "API route not found");
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = { handleApi };
