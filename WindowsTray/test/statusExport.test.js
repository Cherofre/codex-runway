const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const {
  buildStatusExportPath,
  sanitizeStatusSnapshot,
  writeStatusSnapshot,
} = require("../statusExport");

test("buildStatusExportPath targets the Codex Runway cache directory", () => {
  assert.equal(
    buildStatusExportPath("C:\\Users\\me"),
    path.join("C:\\Users\\me", ".codex-runway", "status.json"));
});

test("sanitizeStatusSnapshot removes token-like secrets recursively", () => {
  const sanitized = sanitizeStatusSnapshot({
    auth: {
      accountId: "acct_123",
      accessToken: "secret-access",
      refresh_token: "secret-refresh",
    },
    nested: [{ apiKey: "secret-key", safe: "ok" }],
  });

  assert.deepEqual(sanitized, {
    auth: { accountId: "acct_123" },
    nested: [{ safe: "ok" }],
  });
});

test("writeStatusSnapshot creates the parent directory and writes sanitized JSON", () => {
  const calls = [];
  const target = writeStatusSnapshot({
    generatedAt: "2026-07-04T00:00:00Z",
    auth: { accountId: "acct_123", refreshToken: "secret-refresh" },
  }, {
    homeDir: "C:\\Users\\me",
    mkdir: (dir, options) => calls.push(["mkdir", dir, options.recursive]),
    writeFile: (file, text, encoding) => calls.push(["writeFile", file, JSON.parse(text), encoding]),
  });

  const expected = path.join("C:\\Users\\me", ".codex-runway", "status.json");
  assert.equal(target, expected);
  assert.deepEqual(calls, [
    ["mkdir", path.dirname(expected), true],
    ["writeFile", expected, {
      generatedAt: "2026-07-04T00:00:00Z",
      auth: { accountId: "acct_123" },
    }, "utf8"],
  ]);
});
