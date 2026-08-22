const { PassThrough } = require("stream");
const config = require("../config.cjs");
const { contentDisposition, HttpError, limitStream, pipeline, readJson, requireValue, sendJson } = require("../http.cjs");
const { getDetails, listFiles } = require("../services/files.cjs");
const { setComment } = require("../services/comments.cjs");

async function parseActionBody(req) {
  return readJson(req, config.maxJsonBytes);
}

async function writeRequest(req, adapter, remotePath) {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > config.maxUploadBytes) throw new HttpError(413, "Upload is too large");
  const limited = limitStream(config.maxUploadBytes);
  const pass = new PassThrough();
  const upload = adapter.write(remotePath, pass);
  await Promise.all([pipeline(req, limited, pass), upload]);
}

async function sendDownload(res, download) {
  const headers = {
    "Content-Type": "application/zip",
    "Content-Disposition": contentDisposition(download.name),
    "Cache-Control": "no-store"
  };
  if (Number.isFinite(download.size)) headers["Content-Length"] = download.size;
  res.writeHead(200, headers);

  let streamed = false;
  const cancel = () => {
    if (!streamed && download.cancel) download.cancel();
  };
  res.once("close", cancel);
  try {
    await pipeline(download.stream, res);
    streamed = true;
    res.off("close", cancel);
    if (download.done) await download.done;
  } finally {
    cancel();
  }
}

async function handleFilesRoute(req, res, requestUrl, server, adapter) {
  const pathname = requestUrl.pathname;
  const remotePath = requestUrl.searchParams.get("path");

  if (req.method === "GET" && pathname === "/api/files") {
    sendJson(res, 200, await listFiles(adapter, remotePath || "/"));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/details") {
    sendJson(res, 200, await getDetails(adapter, server, requireValue(remotePath, "path")));
    return true;
  }
  if (req.method === "GET" && pathname === "/api/read") {
    const content = await adapter.readBuffer(requireValue(remotePath, "path"), config.maxEditBytes);
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": content.length,
      "Cache-Control": "no-store"
    });
    res.end(content);
    return true;
  }
  if (req.method === "GET" && pathname === "/api/download") {
    const download = await adapter.download(requireValue(remotePath, "path"));
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": download.size,
      "Content-Disposition": contentDisposition(download.name),
      "Cache-Control": "no-store"
    });
    await pipeline(download.stream, res);
    if (download.done) await download.done;
    return true;
  }
  if (req.method === "GET" && pathname === "/api/download-folder") {
    await sendDownload(res, await adapter.downloadFolder(requireValue(remotePath, "path")));
    return true;
  }
  if (req.method === "POST" && ["/api/upload", "/api/save"].includes(pathname)) {
    await writeRequest(req, adapter, requireValue(remotePath, "path"));
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method !== "POST") return false;
  const body = await parseActionBody(req);
  let result = { ok: true };
  if (pathname === "/api/mkdir") await adapter.mkdir(requireValue(body.path, "path"));
  else if (pathname === "/api/rename") await adapter.rename(requireValue(body.from, "from"), requireValue(body.to, "to"));
  else if (pathname === "/api/delete") await adapter.remove(requireValue(body.path, "path"));
  else if (pathname === "/api/zip") result = await adapter.zipFolder(requireValue(body.path, "path"));
  else if (pathname === "/api/comment") await setComment(server.id, requireValue(body.path, "path"), body.comment);
  else if (pathname === "/api/delete-bulk") {
    if (!Array.isArray(body.paths) || !body.paths.length) throw new HttpError(400, "No items selected");
    await adapter.deleteBulk(body.paths);
  } else if (pathname === "/api/paste") {
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, "No items selected");
    await adapter.paste({ destination: body.destination || "/", items: body.items, operation: body.operation === "cut" ? "cut" : "copy" });
  } else return false;

  sendJson(res, 200, result);
  return true;
}

module.exports = { handleFilesRoute };
