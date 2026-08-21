const config = require("../config.cjs");
const auth = require("../auth.cjs");
const { readJson, sendJson } = require("../http.cjs");

async function handleAuthRoute(req, res, requestUrl) {
  if (req.method === "GET" && requestUrl.pathname === "/api/session") {
    sendJson(res, 200, auth.sessionStatus(req));
    return true;
  }
  if (req.method === "POST" && requestUrl.pathname === "/api/login") {
    auth.login(req, res, await readJson(req, config.maxJsonBytes));
    return true;
  }
  if (req.method === "POST" && requestUrl.pathname === "/api/logout") {
    auth.logout(req, res);
    return true;
  }
  return false;
}

module.exports = { handleAuthRoute };
