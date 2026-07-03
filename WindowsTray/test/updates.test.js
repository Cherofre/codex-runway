const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  checkForUpdates,
  compareVersions,
  normalizeVersion,
} = require("../updates");

test("normalizeVersion and compareVersions handle v-prefixed semver", () => {
  assert.deepEqual(normalizeVersion("v1.2.3"), [1, 2, 3]);
  assert.equal(compareVersions("v1.2.4", "1.2.3"), 1);
  assert.equal(compareVersions("1.2.3", "v1.2.3"), 0);
  assert.equal(compareVersions("1.2.2", "v1.2.3"), -1);
});

test("checkForUpdates reports a newer GitHub release", async () => {
  const result = await checkForUpdates({
    currentVersion: "0.1.0",
    requestJson: async () => ({
      tag_name: "v0.2.0",
      html_url: "https://github.com/Licoy/codex-runway/releases/tag/v0.2.0",
    }),
  });

  assert.equal(result.status, "newer");
  assert.equal(result.summary, "发现新版本 v0.2.0");
  assert.match(result.detail, /当前版本：0.1.0/);
});

test("checkForUpdates reports when no GitHub releases are available", async () => {
  const result = await checkForUpdates({
    currentVersion: "0.1.0",
    requestJson: async () => {
      const error = new Error("Not Found");
      error.statusCode = 404;
      throw error;
    },
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.summary, "暂未发现可用发布版本");
});
