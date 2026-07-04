const assert = require("node:assert/strict");
const test = require("node:test");

const { buildDiagnosticsText } = require("../diagnostics");

test("buildDiagnosticsText summarizes runtime errors without raw secrets", () => {
  const text = buildDiagnosticsText({
    generatedAt: "2026-07-04T10:00:00Z",
    appInfo: {
      version: "0.1.0",
      platform: "win32",
      mode: "preview",
      userDataPath: "C:\\Users\\me\\AppData\\Roaming\\Codex Runway",
      statusExportPath: "C:\\Users\\me\\.codex-runway\\status.json",
    },
    settings: {
      refreshIntervalMinutes: 10,
      appearance: "light",
      notificationsEnabled: true,
      exportsStatusJSON: true,
    },
    snapshot: {
      generatedAt: "2026-07-04T09:58:00Z",
      auth: {
        accountId: "acct_1234567890abcdef",
        tokenState: "available",
        accessToken: "secret-token",
      },
      errors: [{
        area: "quota",
        code: "timeout",
        message: "The operation could not be completed.",
        rawMessage: "secret raw stack",
        isRetryable: true,
      }],
    },
  });

  assert.match(text, /Codex Runway Diagnostics/);
  assert.match(text, /App: 0\.1\.0 \(preview \/ win32\)/);
  assert.match(text, /Account: available acct_1234…cdef/);
  assert.match(text, /quota/);
  assert.match(text, /timeout/);
  assert.match(text, /retryable: true/);
  assert.match(text, /refreshIntervalMinutes: 10/);
  assert.doesNotMatch(text, /secret-token/);
  assert.doesNotMatch(text, /accessToken/);
  assert.doesNotMatch(text, /rawMessage/);
  assert.doesNotMatch(text, /secret raw stack/);
});
