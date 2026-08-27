const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const modelPromise = import("../src/features/terminal/workspaceModel.js");

test("creates unique tabs and numbers duplicate server names", async () => {
  const { createTerminalTab } = await modelPromise;
  const server = { id: "keepgoing", name: "Keepgoing" };
  const first = createTerminalTab([], server, "/", () => "tab-a");
  const second = createTerminalTab([first], server, "/app", () => "tab-b");
  const third = createTerminalTab([first, second], server, "/var", () => "tab-c");

  assert.deepEqual([first.id, second.id, third.id], ["tab-a", "tab-b", "tab-c"]);
  assert.deepEqual([first.title, second.title, third.title], ["Keepgoing", "Keepgoing 2", "Keepgoing 3"]);
});

test("chooses safe starting paths and a neighboring tab on close", async () => {
  const { neighboringTabId, pathForNewTerminal } = await modelPromise;
  const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(pathForNewTerminal("dark", "dark", "/project"), "/project");
  assert.equal(pathForNewTerminal("minecraft", "dark", "/project"), "/");
  assert.equal(neighboringTabId(tabs, "b"), "c");
  assert.equal(neighboringTabId(tabs, "c"), "b");
  assert.equal(neighboringTabId([{ id: "a" }], "a"), null);
});

test("restarting one tab leaves every other session version unchanged", async () => {
  const { restartTerminalTab } = await modelPromise;
  const tabs = [
    { id: "a", restartVersion: 0, status: { kind: "connected" } },
    { id: "b", restartVersion: 4, status: { kind: "connected" } }
  ];
  const restarted = restartTerminalTab(tabs, "b");
  assert.equal(restarted[0], tabs[0]);
  assert.equal(restarted[1].restartVersion, 5);
  assert.equal(restarted[1].status.kind, "connecting");
});

test("workspace renders every tab session independently of active selection", async () => {
  const source = await fsp.readFile(path.join(process.cwd(), "src", "features", "terminal", "TerminalWorkspace.jsx"), "utf8");
  assert.match(source, /tabs\.map\(\(tab\) => \(/);
  assert.match(source, /<TerminalSession key=\{tab\.id\}/);
  assert.match(source, /active=\{visible && tab\.id === activeId\}/);
});
