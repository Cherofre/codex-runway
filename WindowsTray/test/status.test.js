const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const {
  buildCliEnvironment,
  buildCliInvocation,
  formatStatusLines,
  formatTooltip,
} = require("../status");

test("buildCliInvocation uses explicit CODEX_RUNWAY_CLI path", () => {
  const invocation = buildCliInvocation({
    env: { CODEX_RUNWAY_CLI: "C:\\tools\\CodexRunwayCLI.exe" },
    repoRoot: "C:\\repo",
    resourcesPath: "C:\\app\\resources",
    fileExists: () => false,
  });

  assert.equal(invocation.command, "C:\\tools\\CodexRunwayCLI.exe");
  assert.deepEqual(invocation.args, ["--json"]);
});

test("buildCliInvocation prefers built release executable", () => {
  const releasePath = path.join("C:\\repo", ".build", "release", "CodexRunwayCLI.exe");
  const invocation = buildCliInvocation({
    env: {},
    repoRoot: "C:\\repo",
    resourcesPath: "C:\\app\\resources",
    fileExists: (candidate) => candidate === releasePath,
  });

  assert.equal(invocation.command, releasePath);
  assert.deepEqual(invocation.args, ["--json"]);
});

test("buildCliInvocation prefers manual Windows CLI executable", () => {
  const cliPath = path.join("C:\\repo", ".build", "windows-cli", "CodexRunwayCLI.exe");
  const invocation = buildCliInvocation({
    env: {},
    repoRoot: "C:\\repo",
    resourcesPath: "C:\\app\\resources",
    fileExists: (candidate) => candidate === cliPath,
  });

  assert.equal(invocation.command, cliPath);
  assert.deepEqual(invocation.args, ["--json"]);
});

test("buildCliEnvironment prepends Swift runtime paths on Windows", () => {
  const swiftRoot = "C:\\Users\\Me\\AppData\\Local\\Programs\\Swift";
  const toolchains = path.join(swiftRoot, "Toolchains");
  const runtimes = path.join(swiftRoot, "Runtimes");
  const toolchainBin = path.join(toolchains, "6.3.2+Asserts", "usr", "bin");
  const runtimeBin = path.join(runtimes, "6.3.2", "usr", "bin");
  const pythonPath = path.join(swiftRoot, "Python-3.10.1");
  const existing = new Set([
    toolchains,
    runtimes,
    toolchainBin,
    runtimeBin,
    pythonPath,
  ]);
  const children = new Map([
    [toolchains, ["6.2.0+Asserts", "6.3.2+Asserts"]],
    [runtimes, ["6.2.0", "6.3.2"]],
  ]);

  const env = buildCliEnvironment({
    env: { SWIFT_ROOT: swiftRoot, Path: "C:\\Windows\\System32" },
    platform: "win32",
    fileExists: (candidate) => existing.has(candidate),
    readDir: (dir) => children.get(dir) || [],
  });

  assert.deepEqual(env.Path.split(path.delimiter).slice(0, 3), [
    toolchainBin,
    runtimeBin,
    pythonPath,
  ]);
});

test("formatTooltip summarizes primary quota", () => {
  const tooltip = formatTooltip({
    quota: {
      primary: { usedPercent: 42, remainingPercent: 58, secondsUntilReset: 3600 },
    },
    errors: [],
  });

  assert.equal(tooltip, "Codex Runway：58% 剩余，1小时后重置");
});

test("formatStatusLines localizes status summary", () => {
  const lines = formatStatusLines({
    quota: {
      primary: { remainingPercent: 64 },
      secondary: { remainingPercent: 54 },
    },
    resetCredits: { availableCount: 4, totalCount: 4 },
    apiEquivalent: { estimatedUSD: 54.6555, totalTokens: 62_704_674 },
    sessions: { plannedEntries: 325, missingCount: 163, orphanCount: 88 },
    errors: [],
  });

  assert.deepEqual(lines, [
    "5 小时配额：64% 剩余",
    "每周配额：54% 剩余",
    "重置次数：4/4",
    "API 等价成本：$54.6555，62.70M Tokens",
    "会话：325 已索引，163 缺失，88 孤立",
  ]);
});

test("formatStatusLines includes localized errors without throwing", () => {
  const lines = formatStatusLines({
    quota: null,
    sessions: { plannedEntries: 3, missingCount: 1, orphanCount: 0 },
    errors: [{ area: "quota", message: "offline" }],
  });

  assert.deepEqual(lines, [
    "配额暂不可用",
    "会话：3 已索引，1 缺失，0 孤立",
    "配额：offline",
  ]);
});

test("formatStatusLines hides raw timeout errors", () => {
  const lines = formatStatusLines({
    quota: null,
    errors: [{
      area: "quota",
      message: "The operation could not be completed. (NSURLErrorDomain error -1001.)",
    }],
  });

  assert.deepEqual(lines, [
    "配额暂不可用",
    "配额：请求超时，请稍后刷新",
  ]);
});
