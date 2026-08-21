const { sendJson } = require("../http.cjs");

async function handleStorageRoute(req, res, requestUrl, adapter) {
  if (req.method !== "GET" || requestUrl.pathname !== "/api/storage") return false;
  sendJson(res, 200, await adapter.storage());
  return true;
}

module.exports = { handleStorageRoute };
