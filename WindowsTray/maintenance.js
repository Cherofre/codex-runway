const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function codexHomePath() {
  return path.join(os.homedir(), ".codex");
}

function parseModelProvider(configText) {
  const text = typeof configText === "string" ? configText : "";
  const match = text.match(/^\s*model_provider\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/m);
  return (match?.[1] || match?.[2] || match?.[3] || "openai").trim() || "openai";
}

function readCurrentProvider(homePath = codexHomePath()) {
  try {
    return parseModelProvider(fs.readFileSync(path.join(homePath, "config.toml"), "utf8"));
  } catch {
    return "openai";
  }
}

function windowsPowerShellPath(env = process.env) {
  return env.SystemRoot
    ? path.join(env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
}

function buildRestartCodexPowerShell() {
  return String.raw`
$ErrorActionPreference = "SilentlyContinue"

function Get-CodexLaunchPath {
    $cmd = Get-Command codex.exe -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) {
        $resourcesExe = $cmd.Source
        $resourcesDir = Split-Path $resourcesExe -Parent
        $appDir = Join-Path (Split-Path $resourcesDir -Parent) "app"
        $guiExe = Join-Path $appDir "Codex.exe"
        if (Test-Path $guiExe) { return $guiExe }
    }

    $runningGui = Get-Process Codex -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.Path -match '\\app\\Codex\.exe$' } |
        Select-Object -First 1
    if ($runningGui -and $runningGui.Path) { return $runningGui.Path }

    return $null
}

function Get-CodexStartAppId {
    try {
        $app = Get-StartApps |
            Where-Object { $_.Name -eq "Codex" -and $_.AppID } |
            Select-Object -First 1
        if ($app) { return $app.AppID }
    } catch {}

    return $null
}

$codexPath = Get-CodexLaunchPath
Get-Process Codex -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process codex -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1200

$codexAppId = Get-CodexStartAppId
if ($codexAppId) {
    Start-Process -FilePath "explorer.exe" -ArgumentList ("shell:AppsFolder\" + $codexAppId) | Out-Null
    Start-Sleep -Milliseconds 1600
}

$isUp = Get-Process Codex -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path -match '\\app\\Codex\.exe$' } |
    Select-Object -First 1

if (-not $isUp -and $codexPath) {
    Start-Process -FilePath $codexPath | Out-Null
}

Write-Output "Codex restart command completed"
`.trim();
}

function buildRestartVSCodePowerShell() {
  return String.raw`
$ErrorActionPreference = "SilentlyContinue"

$cmdBefore = @((Get-Process cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id))

Get-Process Code -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

$codeCmd = Get-Command code -ErrorAction SilentlyContinue
$codeExe = $null
if ($codeCmd -and $codeCmd.Source -and $codeCmd.Source -like '*.cmd') {
    $binDir = Split-Path $codeCmd.Source -Parent
    $codeExe = Join-Path (Split-Path $binDir -Parent) 'Code.exe'
}

if ($codeExe -and (Test-Path $codeExe)) {
    Start-Process -FilePath $codeExe | Out-Null
} else {
    Start-Process "code" | Out-Null
}

Start-Sleep -Milliseconds 1200
$newCmd = Get-Process cmd -ErrorAction SilentlyContinue | Where-Object {
    ($cmdBefore -notcontains $_.Id) -and [string]::IsNullOrWhiteSpace($_.MainWindowTitle)
}
if ($newCmd) {
    $newCmd | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Output "VSCode restart command completed"
`.trim();
}

async function runPowerShellScript(script, {
  runner = execFileAsync,
  platform = process.platform,
} = {}) {
  if (platform !== "win32") {
    throw new Error("此操作仅支持 Windows");
  }
  const { stdout, stderr } = await runner(
    windowsPowerShellPath(),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
    });
  return `${stdout || ""}${stderr || ""}`.trim();
}

async function restartCodex(options = {}) {
  await runPowerShellScript(buildRestartCodexPowerShell(), options);
  return {
    summary: "Codex 重启命令已执行",
    detail: "已尝试关闭 Codex/Codex CLI 进程，并通过开始菜单 AppID 或 Codex.exe 重新启动。",
  };
}

async function restartVSCode(options = {}) {
  await runPowerShellScript(buildRestartVSCodePowerShell(), options);
  return {
    summary: "VSCode 重启命令已执行",
    detail: "已尝试关闭 Code 进程，并通过 code 命令或 Code.exe 重新启动。",
  };
}

function getSessionSyncPython() {
  return String.raw`
import json
import pathlib
import shutil
import sqlite3
import sys
from datetime import datetime


def iter_rollouts(codex_home: pathlib.Path):
    for folder in (codex_home / "sessions", codex_home / "archived_sessions"):
        if folder.exists():
            yield from folder.rglob("*.jsonl")


def sqlite_sidecar_paths(db_path: pathlib.Path):
    yield db_path
    yield pathlib.Path(str(db_path) + "-wal")
    yield pathlib.Path(str(db_path) + "-shm")


def has_table(db_path: pathlib.Path, table: str) -> bool:
    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            row = con.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
                (table,),
            ).fetchone()
            return row is not None
        finally:
            con.close()
    except sqlite3.Error:
        return False


def is_session_db(db_path: pathlib.Path) -> bool:
    return any(has_table(db_path, table) for table in ("threads", "automation_runs", "inbox_items"))


def codex_session_db_paths(codex_home: pathlib.Path):
    paths = []
    sqlite_dir = codex_home / "sqlite"
    if sqlite_dir.exists():
        for db_path in sqlite_dir.iterdir():
            if db_path.is_file() and db_path.suffix.lower() in (".db", ".sqlite", ".sqlite3") and is_session_db(db_path):
                paths.append(db_path)

    paths.sort(key=lambda db_path: (db_path.name != "codex-dev.db", db_path.name))

    legacy = codex_home / "state_5.sqlite"
    if legacy not in paths:
        paths.append(legacy)

    return paths


def table_columns(con: sqlite3.Connection, table: str):
    try:
        return {row[1] for row in con.execute(f"PRAGMA table_info({table})").fetchall()}
    except sqlite3.Error:
        return set()


def rollout_thread_id(obj, payload, path: pathlib.Path):
    for value in (
        payload.get("id") if isinstance(payload, dict) else None,
        payload.get("session_id") if isinstance(payload, dict) else None,
        payload.get("thread_id") if isinstance(payload, dict) else None,
        obj.get("id") if isinstance(obj, dict) else None,
    ):
        if isinstance(value, str) and value.strip():
            return value.strip()
    return path.stem


def rewrite_rollout(path: pathlib.Path, target: str, ensure_backup_dir, codex_home: pathlib.Path):
    original = path.read_text(encoding="utf-8", errors="strict").splitlines(True)
    changed = False
    invalid_json_lines = 0
    rewritten = []
    thread_id = ""
    cwd = ""
    has_user_event = False

    for line in original:
        stripped = line.strip()
        if not stripped:
            rewritten.append(line)
            continue

        try:
            obj = json.loads(stripped)
        except json.JSONDecodeError:
            invalid_json_lines += 1
            rewritten.append(line)
            continue

        text_type = obj.get("type")
        payload = obj.get("payload")
        if text_type == "session_meta" and isinstance(payload, dict):
            thread_id = rollout_thread_id(obj, payload, path)
            payload_cwd = payload.get("cwd")
            if isinstance(payload_cwd, str) and payload_cwd.strip():
                cwd = payload_cwd.strip()
            provider = payload.get("model_provider")
            if provider != target:
                payload["model_provider"] = target
                changed = True
                newline = "\n" if line.endswith("\n") else ""
                rewritten.append(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + newline)
                continue
        elif text_type in ("user_message", "user_input"):
            has_user_event = True
        elif isinstance(payload, dict) and payload.get("type") in ("user_message", "user_input"):
            has_user_event = True

        rewritten.append(line)

    if changed:
        destination = ensure_backup_dir() / path.relative_to(codex_home)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
        path.write_text("".join(rewritten), encoding="utf-8", newline="")

    return {
        "changed": changed,
        "invalid_json_lines": invalid_json_lines,
        "thread_id": thread_id,
        "cwd": cwd,
        "has_user_event": has_user_event,
    }


def backup_sqlite_files(db_path: pathlib.Path, ensure_backup_dir, codex_home: pathlib.Path):
    backup_dir = ensure_backup_dir()
    for source in sqlite_sidecar_paths(db_path):
        if not source.exists():
            continue
        try:
            relative = source.relative_to(codex_home)
        except ValueError:
            relative = pathlib.Path(source.name)
        destination = backup_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def update_threads_db(db_path: pathlib.Path, target: str, thread_ids_with_user_events, cwd_by_thread_id, ensure_backup_dir, codex_home: pathlib.Path):
    if not db_path.exists():
        return {"updated": 0, "moved": 0, "target_total": 0}

    con = sqlite3.connect(db_path, timeout=30)
    try:
        con.execute("pragma busy_timeout=30000")
        columns = table_columns(con, "threads")
        if not {"id", "model_provider"}.issubset(columns):
            return {"updated": 0, "moved": 0, "target_total": 0}

        moved = con.execute(
            "SELECT COUNT(*) FROM threads WHERE COALESCE(model_provider, '') <> ?",
            (target,),
        ).fetchone()[0]
        user_event_updates = 0
        cwd_updates = 0

        if "has_user_event" in columns:
            for thread_id in thread_ids_with_user_events:
                user_event_updates += con.execute(
                    "SELECT COUNT(*) FROM threads WHERE id = ? AND COALESCE(has_user_event, 0) <> 1",
                    (thread_id,),
                ).fetchone()[0]

        if "cwd" in columns:
            for thread_id, cwd in cwd_by_thread_id.items():
                cwd_updates += con.execute(
                    "SELECT COUNT(*) FROM threads WHERE id = ? AND COALESCE(cwd, '') <> ?",
                    (thread_id, cwd),
                ).fetchone()[0]

        planned = moved + user_event_updates + cwd_updates
        updated = 0
        if planned > 0:
            backup_sqlite_files(db_path, ensure_backup_dir, codex_home)
            con.execute("BEGIN IMMEDIATE")
            updated += con.execute(
                "UPDATE threads SET model_provider = ? WHERE COALESCE(model_provider, '') <> ?",
                (target, target),
            ).rowcount
            if "has_user_event" in columns:
                for thread_id in thread_ids_with_user_events:
                    updated += con.execute(
                        "UPDATE threads SET has_user_event = 1 WHERE id = ? AND COALESCE(has_user_event, 0) <> 1",
                        (thread_id,),
                    ).rowcount
            if "cwd" in columns:
                for thread_id, cwd in cwd_by_thread_id.items():
                    updated += con.execute(
                        "UPDATE threads SET cwd = ? WHERE id = ? AND COALESCE(cwd, '') <> ?",
                        (cwd, thread_id, cwd),
                    ).rowcount
            con.commit()

        target_total = con.execute(
            "SELECT COUNT(*) FROM threads WHERE model_provider = ?",
            (target,),
        ).fetchone()[0]
        return {"updated": updated, "moved": moved, "target_total": target_total}
    finally:
        con.close()


def main() -> int:
    codex_home = pathlib.Path(sys.argv[1])
    target = sys.argv[2]

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = None

    def ensure_backup_dir():
        nonlocal backup_dir
        if backup_dir is None:
            backup_dir = codex_home / "backups_state" / "provider-sync" / f"provider-source-merge-{timestamp}"
            backup_dir.mkdir(parents=True, exist_ok=True)
        return backup_dir

    rollout_changes = 0
    invalid_json_lines = 0
    thread_ids_with_user_events = set()
    cwd_by_thread_id = {}
    for rollout in iter_rollouts(codex_home):
        result = rewrite_rollout(rollout, target, ensure_backup_dir, codex_home)
        if result["changed"]:
            rollout_changes += 1
        invalid_json_lines += result["invalid_json_lines"]
        if result["thread_id"] and result["has_user_event"]:
            thread_ids_with_user_events.add(result["thread_id"])
        if result["thread_id"] and result["cwd"]:
            cwd_by_thread_id[result["thread_id"]] = result["cwd"]

    db_paths = [db_path for db_path in codex_session_db_paths(codex_home) if db_path.exists()]
    updated = 0
    moved = 0
    total = 0
    for db_path in db_paths:
        result = update_threads_db(
            db_path,
            target,
            thread_ids_with_user_events,
            cwd_by_thread_id,
            ensure_backup_dir,
            codex_home,
        )
        updated += result["updated"]
        moved += result["moved"]
        total += result["target_total"]

    backup_text = str(backup_dir) if backup_dir is not None else "(none)"
    db_paths_text = ",".join(str(db_path) for db_path in db_paths)
    print(
        f"updated={updated};moved={moved};target_total={total};"
        f"rollouts={rollout_changes};invalid_json_lines={invalid_json_lines};"
        f"db_paths={db_paths_text};backup={backup_text}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`.trim();
}

function parseSessionSyncOutput(text, targetProvider) {
  const output = String(text || "").trim();
  const match = output.match(
    /updated=(\d+);moved=(\d+);target_total=(\d+);rollouts=(\d+);invalid_json_lines=(\d+);db_paths=([^;]*);backup=([\s\S]*)$/);
  if (!match) {
    return {
      summary: "会话同步/修复完成",
      detail: output || "同步脚本没有返回详细信息。",
    };
  }

  const [, updated, moved, targetTotal, rollouts, invalidLines, dbPaths, backup] = match;
  const summary = Number(updated) === 0 && Number(rollouts) === 0
    ? "会话同步/修复完成：没有需要修复的会话"
    : `会话同步/修复完成：数据库更新 ${updated} 条，会话文件修复 ${rollouts} 个`;
  const detail = [
    `当前 provider：${targetProvider}`,
    `数据库迁移候选：${moved} 条`,
    `当前 provider 会话数：${targetTotal} 条`,
    `损坏 JSONL 行：${invalidLines} 行`,
    `同步数据库：${dbPaths || "未找到"}`,
    `备份：${backup === "(none)" ? "未创建" : backup}`,
  ].join("\n");

  return { summary, detail };
}

async function findPython(runner = execFileAsync) {
  const candidates = [
    process.env.PYTHON ? { command: process.env.PYTHON, args: [] } : null,
    { command: "python", args: [] },
    { command: "py", args: ["-3"] },
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await runner(candidate.command, [...candidate.args, "--version"], {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 128 * 1024,
      });
      return candidate;
    } catch {}
  }
  throw new Error("未找到 python 或 py，无法同步/修复会话");
}

function safeRemoveTreeInside(targetPath, rootPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const rootKey = process.platform === "win32" ? root.toLowerCase() : root;
  const targetKey = process.platform === "win32" ? target.toLowerCase() : target;
  if (targetKey !== rootKey && !targetKey.startsWith(`${rootKey}${path.sep}`)) {
    throw new Error(`Refusing to remove path outside ${root}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function removeOldProviderMergeBackups(homePath = codexHomePath(), keepCount = 3) {
  const backupRoot = path.join(homePath, "backups_state", "provider-sync");
  if (!fs.existsSync(backupRoot)) return "";

  const backups = fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("provider-source-merge-"))
    .map((entry) => {
      const fullPath = path.join(backupRoot, entry.name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (backups.length <= keepCount) return "";

  let removedCount = 0;
  for (const backup of backups.slice(keepCount)) {
    safeRemoveTreeInside(backup.fullPath, backupRoot);
    removedCount += 1;
  }
  return `清理旧同步备份：删除 ${removedCount} 份，保留最近 ${keepCount} 份`;
}

async function syncCodexSessions({
  homePath = codexHomePath(),
  targetProvider = readCurrentProvider(homePath),
  runner = execFileAsync,
} = {}) {
  const python = await findPython(runner);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-runway-session-sync-"));
  const scriptPath = path.join(tempRoot, "sync-sessions.py");
  try {
    fs.writeFileSync(scriptPath, `${getSessionSyncPython()}\n`, "utf8");
    const { stdout, stderr } = await runner(
      python.command,
      [...python.args, scriptPath, homePath, targetProvider],
      {
        windowsHide: true,
        timeout: 300_000,
        maxBuffer: 4 * 1024 * 1024,
      });
    const output = `${stdout || ""}${stderr || ""}`.trim();
    const result = parseSessionSyncOutput(output, targetProvider);
    const cleanup = removeOldProviderMergeBackups(homePath);
    if (cleanup) result.detail = `${result.detail}\n${cleanup}`;
    return result;
  } finally {
    safeRemoveTreeInside(tempRoot, os.tmpdir());
  }
}

module.exports = {
  buildRestartCodexPowerShell,
  buildRestartVSCodePowerShell,
  getSessionSyncPython,
  parseModelProvider,
  parseSessionSyncOutput,
  readCurrentProvider,
  removeOldProviderMergeBackups,
  restartCodex,
  restartVSCode,
  runPowerShellScript,
  syncCodexSessions,
};
