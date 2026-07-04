const allowedRefreshIntervals = Object.freeze([1, 5, 10, 30]);
const allowedAppearances = Object.freeze(["system", "dark", "light"]);

const defaultSettings = Object.freeze({
  refreshIntervalMinutes: 5,
  appearance: "system",
  showQuotaMeters: true,
  showResetCredits: true,
  showApiEquivalent: true,
  showRecentSessions: true,
  notificationsEnabled: false,
  startAtLogin: false,
  autoCheckUpdates: false,
  exportsStatusJSON: false,
});

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeRefreshInterval(value, fallback = defaultSettings.refreshIntervalMinutes) {
  const minutes = Number(value);
  return allowedRefreshIntervals.includes(minutes) ? minutes : fallback;
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeSettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    refreshIntervalMinutes: normalizeRefreshInterval(
      source.refreshIntervalMinutes,
      defaultSettings.refreshIntervalMinutes),
    appearance: normalizeChoice(source.appearance, allowedAppearances, defaultSettings.appearance),
    showQuotaMeters: normalizeBoolean(source.showQuotaMeters, defaultSettings.showQuotaMeters),
    showResetCredits: normalizeBoolean(source.showResetCredits, defaultSettings.showResetCredits),
    showApiEquivalent: normalizeBoolean(source.showApiEquivalent, defaultSettings.showApiEquivalent),
    showRecentSessions: normalizeBoolean(source.showRecentSessions, defaultSettings.showRecentSessions),
    notificationsEnabled: normalizeBoolean(source.notificationsEnabled, defaultSettings.notificationsEnabled),
    startAtLogin: normalizeBoolean(source.startAtLogin, defaultSettings.startAtLogin),
    autoCheckUpdates: normalizeBoolean(source.autoCheckUpdates, defaultSettings.autoCheckUpdates),
    exportsStatusJSON: normalizeBoolean(source.exportsStatusJSON, defaultSettings.exportsStatusJSON),
  };
}

function mergeSettings(base, patch) {
  return normalizeSettings({
    ...normalizeSettings(base),
    ...(patch && typeof patch === "object" ? patch : {}),
  });
}

module.exports = {
  allowedAppearances,
  allowedRefreshIntervals,
  defaultSettings,
  mergeSettings,
  normalizeSettings,
};
