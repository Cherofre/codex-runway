const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  defaultSettings,
  mergeSettings,
  normalizeSettings,
} = require("../settings");

test("normalizeSettings falls back to defaults for invalid input", () => {
  assert.deepEqual(normalizeSettings({
    refreshIntervalMinutes: 2,
    showQuotaMeters: "yes",
    showResetCredits: 1,
    showApiEquivalent: null,
    showRecentSessions: undefined,
  }), defaultSettings);
});

test("mergeSettings applies supported values and ignores unknown keys", () => {
  const settings = mergeSettings(defaultSettings, {
    refreshIntervalMinutes: 10,
    showResetCredits: false,
    showApiEquivalent: false,
    unknown: "ignored",
  });

  assert.deepEqual(settings, {
    ...defaultSettings,
    refreshIntervalMinutes: 10,
    showResetCredits: false,
    showApiEquivalent: false,
  });
  assert.equal(Object.hasOwn(settings, "unknown"), false);
});
