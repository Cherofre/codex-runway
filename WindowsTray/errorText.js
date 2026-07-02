(function exposeErrorText(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.runwayErrors = api;
  }
})(typeof globalThis === "undefined" ? null : globalThis, () => {
  const areaLabels = Object.freeze({
    auth: "账号",
    "auth.refresh": "账号刷新",
    quota: "配额",
    resetCredits: "重置次数",
    sessions: "会话",
    recentSessions: "最近会话",
    apiEquivalent: "API 等价成本",
    "tray.refresh": "刷新",
    "settings.load": "设置",
    "settings.save": "设置",
  });

  function normalizedText(value) {
    return String(value || "").trim();
  }

  function isTimeoutMessage(message) {
    const text = normalizedText(message).toLowerCase();
    return text.includes("nsurlerrordomain error -1001") ||
      text.includes("timed out") ||
      text.includes("timeout");
  }

  function isNetworkLossMessage(message) {
    const text = normalizedText(message).toLowerCase();
    return text.includes("nsurlerrordomain error -1005") ||
      text.includes("network connection was lost") ||
      text.includes("connection reset") ||
      text.includes("econnreset");
  }

  function isOfflineMessage(message) {
    const text = normalizedText(message).toLowerCase();
    return text.includes("nsurlerrordomain error -1009") ||
      text.includes("not connected to the internet") ||
      text.includes("enotfound") ||
      text.includes("eai_again");
  }

  function friendlyErrorMessage(message) {
    const text = normalizedText(message);
    if (!text) return "未知错误";
    if (isTimeoutMessage(text)) return "请求超时，请稍后刷新";
    if (isNetworkLossMessage(text)) return "网络连接中断，请稍后刷新";
    if (isOfflineMessage(text)) return "网络连接不可用，请检查后刷新";
    if (text.includes("NSURLErrorDomain")) return "网络请求失败，请稍后刷新";
    return text;
  }

  function areaLabel(area) {
    return areaLabels[area] || area || "状态";
  }

  function formatErrorLine(error) {
    return `${areaLabel(error && error.area)}：${friendlyErrorMessage(error && error.message)}`;
  }

  function isRetryableError(error) {
    if (!error) return false;
    const area = error.area || "";
    if (area === "auth" || area === "auth.refresh") return false;
    return isTimeoutMessage(error.message) || isNetworkLossMessage(error.message);
  }

  function snapshotHasRetryableError(snapshot) {
    return Array.isArray(snapshot && snapshot.errors) && snapshot.errors.some(isRetryableError);
  }

  return {
    formatErrorLine,
    friendlyErrorMessage,
    isRetryableError,
    snapshotHasRetryableError,
  };
});
