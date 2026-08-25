const BINARY_EXTENSIONS = new Set([
  ".7z", ".avi", ".bmp", ".class", ".dll", ".dmg", ".doc", ".docx",
  ".exe", ".gif", ".gz", ".ico", ".iso", ".jar", ".jpeg", ".jpg",
  ".mkv", ".mov", ".mp3", ".mp4", ".odt", ".pdf", ".png", ".ppt",
  ".pptx", ".rar", ".so", ".tar", ".tgz", ".wav", ".webm", ".webp",
  ".woff", ".woff2", ".xls", ".xlsx", ".xz", ".zip"
]);

const LANGUAGE_BY_EXTENSION = new Map([
  [".js", "javascript"], [".cjs", "javascript"], [".mjs", "javascript"],
  [".jsx", "jsx"], [".ts", "typescript"], [".tsx", "tsx"],
  [".json", "json"], [".html", "html"], [".htm", "html"],
  [".css", "css"], [".py", "python"], [".sh", "shell"],
  [".bash", "shell"], [".md", "markdown"], [".xml", "xml"],
  [".yml", "yaml"], [".yaml", "yaml"], [".sql", "sql"]
]);

export function fileExtension(filename) {
  const name = String(filename || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

export function isObviousBinaryFile(filename) {
  return BINARY_EXTENSIONS.has(fileExtension(filename));
}

export function languageKeyForFilename(filename) {
  return LANGUAGE_BY_EXTENSION.get(fileExtension(filename)) || "plain";
}

