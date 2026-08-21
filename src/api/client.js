export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiPath(pathname, serverId, params = {}) {
  const url = new URL(pathname, window.location.origin);
  if (serverId) url.searchParams.set("serverId", serverId);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

async function responseError(response) {
  const payload = await response.json().catch(() => ({}));
  return new ApiError(payload.error || `Request failed (${response.status})`, response.status);
}

export async function requestJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    credentials: "same-origin",
    ...options,
    headers: options.body === undefined ? options.headers : { "Content-Type": "application/json", ...options.headers }
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function requestText(pathname) {
  const response = await fetch(pathname, { credentials: "same-origin" });
  if (!response.ok) throw await responseError(response);
  return response.text();
}

export async function uploadBody(serverId, remotePath, body) {
  const response = await fetch(apiPath("/api/upload", serverId, { path: remotePath }), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/octet-stream" },
    body
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function saveText(serverId, remotePath, content) {
  const response = await fetch(apiPath("/api/save", serverId, { path: remotePath }), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: content
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export function downloadUrl(serverId, remotePath) {
  return apiPath("/api/download", serverId, { path: remotePath });
}
