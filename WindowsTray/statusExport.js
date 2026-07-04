const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const secretKeyPattern = /(access[-_]?token|refresh[-_]?token|api[-_]?key|authorization|secret)/i;

function buildStatusExportPath(homeDir = os.homedir()) {
  return path.join(homeDir, ".codex-runway", "status.json");
}

function sanitizeStatusSnapshot(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeStatusSnapshot);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) continue;
    result[key] = sanitizeStatusSnapshot(child);
  }
  return result;
}

function writeStatusSnapshot(snapshot, {
  homeDir = os.homedir(),
  mkdir = fs.mkdirSync,
  writeFile = fs.writeFileSync,
} = {}) {
  const target = buildStatusExportPath(homeDir);
  mkdir(path.dirname(target), { recursive: true });
  writeFile(target, `${JSON.stringify(sanitizeStatusSnapshot(snapshot), null, 2)}\n`, "utf8");
  return target;
}

module.exports = {
  buildStatusExportPath,
  sanitizeStatusSnapshot,
  writeStatusSnapshot,
};
