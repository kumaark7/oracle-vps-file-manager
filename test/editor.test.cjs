const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");

const {
  assertEditablePath,
  decodeEditableBuffer,
  isObviousBinaryPath
} = require("../server/services/editor.cjs");
const { LocalAdapter } = require("../server/adapters/local.cjs");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ovfm-editor-"));

test.after(async () => {
  await fsp.rm(temporaryRoot, { recursive: true, force: true });
});

test("detects editable languages and leaves unknown text in plain mode", async () => {
  const { languageKeyForFilename } = await import("../src/features/editor/fileTypes.js");
  const expected = {
    "app.js": "javascript", "server.cjs": "javascript", "view.jsx": "jsx",
    "types.ts": "typescript", "view.tsx": "tsx", "data.json": "json",
    "index.html": "html", "site.css": "css", "task.py": "python",
    "deploy.sh": "shell", "README.md": "markdown", "feed.xml": "xml",
    "config.yml": "yaml", "query.sql": "sql", "notes.conf": "plain"
  };
  for (const [filename, language] of Object.entries(expected)) {
    assert.equal(languageKeyForFilename(filename), language);
  }
});

test("rejects obvious binary extensions and binary content", async () => {
  const { isObviousBinaryFile } = await import("../src/features/editor/fileTypes.js");
  for (const filename of ["photo.png", "archive.zip", "video.mp4", "manual.pdf", "library.so"]) {
    assert.equal(isObviousBinaryFile(filename), true);
    assert.equal(isObviousBinaryPath(`/files/${filename}`), true);
    assert.throws(() => assertEditablePath(`/files/${filename}`), /cannot be edited/);
  }
  assert.equal(isObviousBinaryFile("settings.conf"), false);
  assert.throws(() => decodeEditableBuffer(Buffer.from([65, 0, 66]), "/unknown.data"), /binary data/);
  assert.throws(() => decodeEditableBuffer(Buffer.from([0xc3, 0x28]), "/unknown.data"), /UTF-8/);
  assert.equal(decodeEditableBuffer(Buffer.from("hello\n", "utf8"), "/unknown.data"), "hello\n");
});

test("editor API includes the selected server in read and save requests", async () => {
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const calls = [];
  global.window = { location: { origin: "http://127.0.0.1:4174" } };
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === "POST") {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("const value = 1;", { status: 200, headers: { "Content-Type": "text/plain" } });
  };

  try {
    const { readEditorFile, saveEditorFile } = await import("../src/features/editor/editorApi.js");
    await readEditorFile("dark", "/app/config.js");
    await saveEditorFile("minecraft", "/plugins/config.yml", "enabled: true\n");
    assert.equal(calls[0].url, "/api/read?serverId=dark&path=%2Fapp%2Fconfig.js");
    assert.equal(calls[1].url, "/api/save?serverId=minecraft&path=%2Fplugins%2Fconfig.yml");
    assert.equal(calls[1].options.body, "enabled: true\n");
  } finally {
    global.window = originalWindow;
    global.fetch = originalFetch;
  }
});

test("local adapter reads and writes editor content inside its configured root", async () => {
  const adapter = new LocalAdapter({ id: "local-test", kind: "local", rootPath: temporaryRoot });
  await adapter.write("/sample.js", Readable.from("const answer = 42;\n"));
  const content = decodeEditableBuffer(await adapter.readBuffer("/sample.js", 1024), "/sample.js");
  assert.equal(content, "const answer = 42;\n");
  await assert.rejects(adapter.readBuffer("/sample.js", 4), /too large/);
  assert.throws(() => adapter.resolve("/../outside.txt"), /outside the configured file root/);
});
