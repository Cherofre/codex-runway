const fs = require("node:fs");
const path = require("node:path");
const { formatErrorLine, friendlyErrorMessage } = require("./errorText");

function buildCliInvocation({
  env = process.env,
  repoRoot = path.resolve(__dirname, ".."),
  resourcesPath = process.resourcesPath,
  fileExists = fs.existsSync,
} = {}) {
  if (env.CODEX_RUNWAY_CLI) {
    return { command: env.CODEX_RUNWAY_CLI, args: ["--json"], cwd: repoRoot };
  }

  const executableName = process.platform === "win32" ? "CodexRunwayCLI.exe" : "CodexRunwayCLI";
  const candidates = [
    resourcesPath ? path.join(resourcesPath, executableName) : null,
    path.join(repoRoot, ".build", "windows-cli", executableName),
    path.join(repoRoot, ".build", "release", executableName),
    path.join(repoRoot, ".build", "debug", executableName),
  ].filter(Boolean);

  const command = candidates.find(fileExists);
  if (command) {
    return { command, args: ["--json"], cwd: repoRoot };
  }

  return { command: "swift", args: ["run", "CodexRunwayCLI", "--json"], cwd: repoRoot };
}

function buildCliEnvironment({
  env = process.env,
  platform = process.platform,
  fileExists = fs.existsSync,
  readDir = fs.readdirSync,
} = {}) {
  const result = { ...env };
  if (platform !== "win32") return result;

  const swiftRoot = env.SWIFT_ROOT || (env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "Swift"));
  if (!swiftRoot) return result;

  const additions = [
    latestVersionedBin(path.join(swiftRoot, "Toolchains"), "usr", "bin", fileExists, readDir),
    latestVersionedBin(path.join(swiftRoot, "Runtimes"), "usr", "bin", fileExists, readDir),
    fileExists(path.join(swiftRoot, "Python-3.10.1")) ? path.join(swiftRoot, "Python-3.10.1") : null,
  ].filter(Boolean);

  if (additions.length === 0) return result;

  const pathKey = Object.keys(result).find((key) => key.toLowerCase() === "path") || "Path";
  const existingPath = result[pathKey] || "";
  const existingParts = existingPath.split(path.delimiter).filter(Boolean);
  const seen = new Set(existingParts.map((entry) => entry.toLowerCase()));
  const uniqueAdditions = additions.filter((entry) => {
    const key = entry.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  result[pathKey] = [...uniqueAdditions, ...existingParts].join(path.delimiter);
  return result;
}

function latestVersionedBin(parent, ...partsAndHelpers) {
  const readDir = partsAndHelpers.pop();
  const fileExists = partsAndHelpers.pop();
  const parts = partsAndHelpers;
  if (!fileExists(parent)) return null;
  let versions;
  try {
    versions = readDir(parent).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  } catch {
    return null;
  }
  for (const version of versions.reverse()) {
    const binPath = path.join(parent, version, ...parts);
    if (fileExists(binPath)) return binPath;
  }
  return null;
}

function formatTooltip(snapshot) {
  const primary = snapshot && snapshot.quota && snapshot.quota.primary;
  if (!primary) {
    const firstError = snapshot && Array.isArray(snapshot.errors) && snapshot.errors[0];
    return firstError ? `Codex Runway：${friendlyErrorMessage(firstError.message)}` : "Codex Runway";
  }
  const resetText = primary.secondsUntilReset == null ? "" : `，${compactDuration(primary.secondsUntilReset)}后重置`;
  return `Codex Runway：${primary.remainingPercent}% 剩余${resetText}`;
}

function formatStatusLines(snapshot) {
  const lines = [];
  const quota = snapshot && snapshot.quota;
  if (quota && quota.primary) {
    lines.push(`5 小时配额：${quota.primary.remainingPercent}% 剩余`);
    if (quota.secondary) {
      lines.push(`每周配额：${quota.secondary.remainingPercent}% 剩余`);
    }
  } else {
    lines.push("配额暂不可用");
  }

  if (snapshot && snapshot.resetCredits) {
    lines.push(`重置次数：${snapshot.resetCredits.availableCount}/${snapshot.resetCredits.totalCount}`);
  }

  if (snapshot && snapshot.apiEquivalent) {
    const amount = snapshot.apiEquivalent.estimatedUSD == null
      ? "--"
      : `$${Number(snapshot.apiEquivalent.estimatedUSD).toFixed(4)}`;
    lines.push(`API 等价成本：${amount}，${formatTokens(snapshot.apiEquivalent.totalTokens)} Tokens`);
  }

  if (snapshot && snapshot.sessions) {
    lines.push(
      `会话：${snapshot.sessions.plannedEntries} 已索引，` +
      `${snapshot.sessions.missingCount} 缺失，${snapshot.sessions.orphanCount} 孤立`);
  }

  for (const error of (snapshot && snapshot.errors) || []) {
    lines.push(formatErrorLine(error));
  }

  return lines;
}

function compactDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}小时${minutes}分钟`;
  if (hours > 0) return `${hours}小时`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${Math.floor(value)}秒`;
}

function formatTokens(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return `${Math.round(number)}`;
}

module.exports = {
  buildCliEnvironment,
  buildCliInvocation,
  compactDuration,
  formatTokens,
  formatStatusLines,
  formatTooltip,
};
