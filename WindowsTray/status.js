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
    return firstError ? `Codex Runway: ${friendlyErrorMessage(firstError.message)}` : "Codex Runway";
  }
  const resetText = primary.secondsUntilReset == null ? "" : `, resets in ${compactDuration(primary.secondsUntilReset)}`;
  return `Codex Runway: ${primary.remainingPercent}% left${resetText}`;
}

function formatStatusLines(snapshot) {
  const lines = [];
  const quota = snapshot && snapshot.quota;
  if (quota && quota.primary) {
    lines.push(`5h quota: ${quota.primary.remainingPercent}% left`);
    if (quota.secondary) {
      lines.push(`Weekly quota: ${quota.secondary.remainingPercent}% left`);
    }
  } else {
    lines.push("Quota unavailable");
  }

  if (snapshot && snapshot.resetCredits) {
    lines.push(`Reset credits: ${snapshot.resetCredits.availableCount}/${snapshot.resetCredits.totalCount}`);
  }

  if (snapshot && snapshot.apiEquivalent) {
    const amount = snapshot.apiEquivalent.estimatedUSD == null
      ? "--"
      : `$${Number(snapshot.apiEquivalent.estimatedUSD).toFixed(4)}`;
    lines.push(`API equivalent: ${amount}, ${snapshot.apiEquivalent.totalTokens} tokens`);
  }

  if (snapshot && snapshot.sessions) {
    lines.push(
      `Sessions: ${snapshot.sessions.plannedEntries} indexed, ` +
      `${snapshot.sessions.missingCount} missing, ${snapshot.sessions.orphanCount} orphan`);
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
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(value)}s`;
}

module.exports = {
  buildCliEnvironment,
  buildCliInvocation,
  compactDuration,
  formatStatusLines,
  formatTooltip,
};
