(function exposeDiagnostics(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.runwayDiagnostics = api;
  }
})(typeof globalThis === "undefined" ? null : globalThis, () => {
  function clean(value) {
    return String(value == null ? "--" : value);
  }

  function maskAccountId(accountId) {
    const value = String(accountId || "");
    if (!value) return "--";
    if (value.length <= 12) return value;
    return `${value.slice(0, 9)}…${value.slice(-4)}`;
  }

  function errorLine(error) {
    const parts = [
      `area: ${clean(error && error.area)}`,
      `code: ${clean(error && error.code)}`,
      `retryable: ${Boolean(error && error.isRetryable)}`,
      `message: ${clean(error && error.message)}`,
    ];
    return `- ${parts.join(" | ")}`;
  }

  function buildDiagnosticsText({
    generatedAt = new Date().toISOString(),
    appInfo = {},
    settings = {},
    snapshot = {},
  } = {}) {
    const errors = Array.isArray(snapshot.errors) ? snapshot.errors : [];
    const auth = snapshot.auth || {};

    return [
      "Codex Runway Diagnostics",
      `Generated: ${clean(generatedAt)}`,
      `App: ${clean(appInfo.version)} (${clean(appInfo.mode)} / ${clean(appInfo.platform)})`,
      `UserData: ${clean(appInfo.userDataPath)}`,
      `StatusJSON: ${clean(appInfo.statusExportPath)}`,
      `Snapshot: ${clean(snapshot.generatedAt)}`,
      `Account: ${clean(auth.tokenState)} ${maskAccountId(auth.accountId)}`,
      "",
      "Settings:",
      `- refreshIntervalMinutes: ${clean(settings.refreshIntervalMinutes)}`,
      `- appearance: ${clean(settings.appearance)}`,
      `- notificationsEnabled: ${Boolean(settings.notificationsEnabled)}`,
      `- exportsStatusJSON: ${Boolean(settings.exportsStatusJSON)}`,
      "",
      "Errors:",
      ...(errors.length ? errors.map(errorLine) : ["- none"]),
    ].join("\n");
  }

  return {
    buildDiagnosticsText,
    maskAccountId,
  };
});
