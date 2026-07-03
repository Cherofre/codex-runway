const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  buildRestartCodexPowerShell,
  buildRestartVSCodePowerShell,
  getSessionSyncPython,
  parseModelProvider,
  parseSessionSyncOutput,
} = require("../maintenance");

test("parseModelProvider reads the configured provider and falls back to openai", () => {
  assert.equal(parseModelProvider('model_provider = "custom-2"\n'), "custom-2");
  assert.equal(parseModelProvider("# model_provider = ignored\n"), "openai");
  assert.equal(parseModelProvider(""), "openai");
});

test("restart scripts contain the expected Codex and VSCode process actions", () => {
  const codexScript = buildRestartCodexPowerShell();
  assert.match(codexScript, /Get-Process Codex/);
  assert.match(codexScript, /Get-StartApps/);
  assert.match(codexScript, /Codex\.exe/);

  const vscodeScript = buildRestartVSCodePowerShell();
  assert.match(vscodeScript, /Get-Process Code/);
  assert.match(vscodeScript, /Get-Command code/);
  assert.match(vscodeScript, /Code\.exe/);
});

test("session sync helper covers sqlite databases, jsonl metadata, and backups", () => {
  const script = getSessionSyncPython();

  assert.match(script, /def codex_session_db_paths/);
  assert.match(script, /codex-dev\.db/);
  assert.match(script, /has_user_event/);
  assert.match(script, /cwd_by_thread_id/);
  assert.match(script, /backups_state/);
  assert.match(script, /provider-sync/);
});

test("parseSessionSyncOutput summarizes provider sync results", () => {
  const result = parseSessionSyncOutput(
    "updated=3;moved=2;target_total=9;rollouts=1;invalid_json_lines=0;db_paths=C:/Users/me/.codex/sqlite/codex-dev.db;backup=(none)",
    "openai");

  assert.equal(result.summary, "会话同步/修复完成：数据库更新 3 条，会话文件修复 1 个");
  assert.match(result.detail, /当前 provider：openai/);
  assert.match(result.detail, /备份：未创建/);
});
