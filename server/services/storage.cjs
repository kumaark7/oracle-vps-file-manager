const fsp = require("fs/promises");
const path = require("path");

function emptyUsage() {
  return { totalSize: 0, categories: { documents: 0, images: 0, videos: 0, others: 0 } };
}

function detectCategory(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"].includes(extension)) return "images";
  if ([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"].includes(extension)) return "videos";
  if ([".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".xls", ".xlsx", ".csv", ".ppt", ".pptx"].includes(extension)) return "documents";
  return "others";
}

async function scanUsage(startPath) {
  const result = emptyUsage();
  const pending = [startPath];

  while (pending.length) {
    const current = pending.pop();
    try {
      const stats = await fsp.lstat(current);
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) {
        const children = await fsp.readdir(current);
        for (const child of children) pending.push(path.join(current, child));
        continue;
      }
      const size = stats.size || 0;
      const category = stats.isFile() ? detectCategory(current) : "others";
      result.totalSize += size;
      result.categories[category] += size;
    } catch {
      // Inaccessible files are skipped so one entry cannot break the whole dashboard.
    }
  }
  return result;
}

module.exports = { detectCategory, emptyUsage, scanUsage };
