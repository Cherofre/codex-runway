const quotaThresholds = Object.freeze([80, 95, 100]);
const resetExpiryWindowSeconds = 3 * 24 * 60 * 60;
const maxSeenIds = 200;

function buildAlertCandidates(snapshot = {}) {
  return [
    ...buildQuotaAlerts(snapshot.quota),
    ...buildResetCreditAlerts(snapshot.resetCredits),
  ];
}

function buildQuotaAlerts(quota) {
  return quotaWindows(quota).flatMap(({ key, label, window }) => {
    const remainingPercent = normalizePercent(window?.remainingPercent);
    if (remainingPercent == null) return [];

    const usedPercent = 100 - remainingPercent;
    const threshold = highestReachedThreshold(usedPercent);
    if (threshold == null) return [];

    const resetKey = window?.resetsAt || "unknown";
    return [{
      id: `quota:${key}:${threshold}:${resetKey}`,
      kind: "quota",
      title: "Codex 配额提醒",
      body: `${label}用量已达到 ${threshold}%`,
    }];
  });
}

function quotaWindows(quota) {
  if (!quota || typeof quota !== "object") return [];
  return [
    quota.primary ? { key: "5h", label: "5 小时", window: quota.primary } : null,
    quota.secondary ? { key: "weekly", label: "每周", window: quota.secondary } : null,
    ...((quota.additional || []).map((item, index) => {
      const name = item?.name || `additional-${index + 1}`;
      return item?.window ? { key: String(name), label: String(name), window: item.window } : null;
    })),
  ].filter(Boolean);
}

function highestReachedThreshold(usedPercent) {
  let reached = null;
  for (const threshold of quotaThresholds) {
    if (usedPercent >= threshold) reached = threshold;
  }
  return reached;
}

function buildResetCreditAlerts(resetCredits) {
  const credits = Array.isArray(resetCredits?.credits) ? resetCredits.credits : [];
  const riskyCredits = credits
    .filter((credit) => (credit?.status || "available") === "available")
    .filter((credit) => credit?.risk === "expiring" || isWithinResetExpiryWindow(credit?.remainingSeconds))
    .sort(compareResetCredits);

  const credit = riskyCredits[0];
  if (!credit) return [];

  const expiresAt = credit.expiresAt || "unknown";
  const creditKey = credit.id || expiresAt;
  return [{
    id: `reset-credit:${creditKey}:${expiresAt}`,
    kind: "reset-credit",
    title: "重置次数即将到期",
    body: `1 次重置将在 ${compactDuration(credit.remainingSeconds)} 后到期`,
  }];
}

function compareResetCredits(left, right) {
  return resetSortValue(left) - resetSortValue(right);
}

function resetSortValue(credit) {
  const seconds = Number(credit?.remainingSeconds);
  if (Number.isFinite(seconds)) return seconds;
  const expiresAt = new Date(credit?.expiresAt || "").getTime();
  return Number.isNaN(expiresAt) ? Number.MAX_SAFE_INTEGER : expiresAt;
}

function isWithinResetExpiryWindow(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value >= 0 && value <= resetExpiryWindowSeconds;
}

function nextUnseenAlerts(candidates, state) {
  const seen = new Set(normalizeAlertState(state).seenIds);
  return (Array.isArray(candidates) ? candidates : []).filter((alert) => {
    return alert?.id && !seen.has(alert.id);
  });
}

function rememberDeliveredAlerts(state, alerts) {
  const ids = normalizeAlertState(state).seenIds;
  const seen = new Set(ids);
  for (const alert of Array.isArray(alerts) ? alerts : []) {
    if (alert?.id) seen.add(alert.id);
  }
  return {
    seenIds: [...seen].slice(-maxSeenIds),
  };
}

function normalizeAlertState(input = {}) {
  const seenIds = Array.isArray(input?.seenIds) ? input.seenIds : [];
  const uniqueIds = [];
  const seen = new Set();
  for (const id of seenIds) {
    if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    uniqueIds.push(id);
  }
  return {
    seenIds: uniqueIds.slice(-maxSeenIds),
  };
}

function normalizePercent(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function compactDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days > 0) return `${days}天${hours > 0 ? `${hours}小时` : ""}`;
  if (hours > 0) return `${hours}小时${minutes > 0 ? `${minutes}分钟` : ""}`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${Math.floor(value)}秒`;
}

module.exports = {
  buildAlertCandidates,
  compactDuration,
  nextUnseenAlerts,
  normalizeAlertState,
  rememberDeliveredAlerts,
};
