const assert = require("node:assert/strict");
const { test } = require("node:test");

const { buildLoginItemSettings } = require("../startup");

test("buildLoginItemSettings targets the packaged executable without dev args", () => {
  assert.deepEqual(buildLoginItemSettings({
    openAtLogin: true,
    execPath: "C:\\Program Files\\Codex Runway\\Codex Runway.exe",
    appPath: "C:\\ignored",
    isPackaged: true,
  }), {
    openAtLogin: true,
    path: "C:\\Program Files\\Codex Runway\\Codex Runway.exe",
    args: [],
  });
});

test("buildLoginItemSettings adds the Electron app path during development", () => {
  assert.deepEqual(buildLoginItemSettings({
    openAtLogin: false,
    execPath: "C:\\repo\\WindowsTray\\node_modules\\electron\\dist\\electron.exe",
    appPath: "C:\\repo\\WindowsTray",
    isPackaged: false,
  }), {
    openAtLogin: false,
    path: "C:\\repo\\WindowsTray\\node_modules\\electron\\dist\\electron.exe",
    args: ["C:\\repo\\WindowsTray"],
  });
});
