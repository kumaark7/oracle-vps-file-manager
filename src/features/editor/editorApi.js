import { apiPath, requestText, saveText } from "../../api/client.js";

export function readEditorFile(serverId, remotePath) {
  return requestText(apiPath("/api/read", serverId, { path: remotePath }));
}

export function saveEditorFile(serverId, remotePath, content) {
  return saveText(serverId, remotePath, content);
}

