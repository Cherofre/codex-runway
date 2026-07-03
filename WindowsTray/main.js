const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const { fetchSnapshotWithRetry } = require("./refresh");
const {
  buildAlertCandidates,
  nextUnseenAlerts,
  normalizeAlertState,
  rememberDeliveredAlerts,
} = require("./alerts");
const {
  buildCliEnvironment,
  buildCliInvocation,
  formatStatusLines,
  formatTooltip,
} = require("./status");
const {
  restartCodex,
  restartVSCode,
  syncCodexSessions,
} = require("./maintenance");
const { defaultSettings, mergeSettings } = require("./settings");

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, "..");
const smokeMode = process.env.CODEX_RUNWAY_TRAY_SMOKE === "1" || process.argv.includes("--smoke");
const uiSmokeMode = process.env.CODEX_RUNWAY_TRAY_UI_SMOKE === "1" || process.argv.includes("--ui-smoke");
const previewMode = process.env.CODEX_RUNWAY_TRAY_PREVIEW === "1" || process.argv.includes("--show");
if (uiSmokeMode) {
  app.setPath("userData", path.join(os.tmpdir(), `codex-runway-tray-ui-smoke-${process.pid}`));
}
let tray = null;
let statusWindow = null;
let latestSnapshot = null;
let isRefreshing = false;
let refreshTimer = null;
let settings = { ...defaultSettings };
let settingsPath = null;
let alertState = normalizeAlertState();
let alertStatePath = null;
let maintenanceBusy = false;

function iconPath() {
  return path.join(repoRoot, "Resources", "AppIcon.png");
}

function trayIcon() {
  const image = nativeImage.createFromPath(iconPath());
  return image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 });
}

async function readCliStatusSnapshot() {
  const invocation = buildCliInvocation({ repoRoot });
  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: buildCliEnvironment(),
    timeout: 180_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function refreshStatus() {
  if (isRefreshing) return currentPayload({ loading: true });
  isRefreshing = true;
  updateMenu({ loading: true });
  broadcastStatus({ loading: true });
  try {
    latestSnapshot = await fetchSnapshotWithRetry({
      runOnce: readCliStatusSnapshot,
      maxAttempts: 2,
      retryDelayMs: 1_200,
    });
    deliverNotifications(latestSnapshot);
  } catch (error) {
    latestSnapshot = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      auth: { isAvailable: false, tokenState: "unavailable", accountId: null },
      quota: null,
      resetCredits: null,
      sessions: null,
      recentSessions: [],
      apiEquivalent: null,
      errors: [{ area: "tray.refresh", message: error.message }],
    };
  } finally {
    isRefreshing = false;
    updateMenu();
    broadcastStatus();
  }
  return currentPayload();
}

function fallbackSnapshot({ loading = false } = {}) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    auth: { isAvailable: false, tokenState: loading ? "loading" : "unavailable", accountId: null },
    quota: null,
    resetCredits: null,
    sessions: null,
    recentSessions: [],
    apiEquivalent: null,
    errors: [],
  };
}

function currentPayload({ loading = false } = {}) {
  return {
    loading,
    settings: { ...settings },
    snapshot: latestSnapshot || fallbackSnapshot({ loading }),
  };
}

function broadcastStatus({ loading = false } = {}) {
  if (!statusWindow || statusWindow.isDestroyed()) return;
  statusWindow.webContents.send("status-updated", currentPayload({ loading }));
}

function loadSettings() {
  settingsPath = path.join(app.getPath("userData"), "settings.json");
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    settings = mergeSettings(defaultSettings, JSON.parse(raw));
  } catch (error) {
    settings = { ...defaultSettings };
    if (error.code && error.code !== "ENOENT") {
      latestSnapshot = {
        ...fallbackSnapshot(),
        errors: [{ area: "settings.load", message: error.message }],
      };
    }
  }
  return settings;
}

function saveSettings() {
  if (!settingsPath) settingsPath = path.join(app.getPath("userData"), "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function loadAlertState() {
  alertStatePath = path.join(app.getPath("userData"), "alerts.json");
  try {
    const raw = fs.readFileSync(alertStatePath, "utf8");
    alertState = normalizeAlertState(JSON.parse(raw));
  } catch {
    alertState = normalizeAlertState();
  }
  return alertState;
}

function saveAlertState() {
  if (!alertStatePath) alertStatePath = path.join(app.getPath("userData"), "alerts.json");
  fs.mkdirSync(path.dirname(alertStatePath), { recursive: true });
  fs.writeFileSync(alertStatePath, `${JSON.stringify(alertState, null, 2)}\n`, "utf8");
}

function deliverNotifications(snapshot) {
  if (!settings.notificationsEnabled || smokeMode || uiSmokeMode) return;
  if (typeof Notification.isSupported === "function" && !Notification.isSupported()) return;

  const candidates = buildAlertCandidates(snapshot);
  const alerts = nextUnseenAlerts(candidates, alertState).slice(0, 3);
  const delivered = [];
  for (const alert of alerts) {
    try {
      new Notification({
        title: alert.title,
        body: alert.body,
      }).show();
      delivered.push(alert);
    } catch {
      break;
    }
  }
  if (delivered.length === 0) return;
  alertState = rememberDeliveredAlerts(alertState, delivered);
  saveAlertState();
}

function showSystemNotice(title, body) {
  if (smokeMode || uiSmokeMode) return;
  if (typeof Notification.isSupported === "function" && !Notification.isSupported()) return;
  try {
    new Notification({ title, body }).show();
  } catch {}
}

function dialogTarget() {
  return statusWindow && !statusWindow.isDestroyed() ? statusWindow : null;
}

function showDialog(options) {
  const target = dialogTarget();
  return target ? dialog.showMessageBox(target, options) : dialog.showMessageBox(options);
}

async function runMaintenanceAction(label, action, {
  confirm = false,
  refreshAfter = false,
  confirmDetail = "",
} = {}) {
  if (maintenanceBusy) return;
  if (process.platform !== "win32") {
    await showDialog({
      type: "warning",
      message: `${label}仅支持 Windows`,
      buttons: ["确定"],
    });
    return;
  }

  if (confirm) {
    const answer = await showDialog({
      type: "warning",
      buttons: ["继续", "取消"],
      defaultId: 1,
      cancelId: 1,
      message: `要执行${label}吗？`,
      detail: confirmDetail,
    });
    if (answer.response !== 0) return;
  }

  maintenanceBusy = true;
  updateMenu({ loading: isRefreshing });
  showSystemNotice("Codex Runway", `${label}正在执行`);
  try {
    const result = await action();
    showSystemNotice("Codex Runway", result.summary || `${label}完成`);
    await showDialog({
      type: "info",
      buttons: ["确定"],
      message: result.summary || `${label}完成`,
      detail: result.detail || "",
    });
    if (refreshAfter) {
      refreshStatus();
    }
  } catch (error) {
    showSystemNotice("Codex Runway", `${label}失败：${error.message}`);
    await showDialog({
      type: "error",
      buttons: ["确定"],
      message: `${label}失败`,
      detail: error.message,
    });
  } finally {
    maintenanceBusy = false;
    updateMenu({ loading: isRefreshing });
  }
}

function runSessionSyncFromMenu() {
  runMaintenanceAction("同步/修复会话", () => syncCodexSessions(), {
    confirm: true,
    refreshAfter: true,
    confirmDetail: [
      "将扫描 ~/.codex/sessions、archived_sessions、sqlite 数据库和旧 state_5.sqlite。",
      "会把会话 provider 同步到当前 config.toml 的 model_provider，并回填 has_user_event / cwd。",
      "有实际改动时会先备份到 ~/.codex/backups_state/provider-sync。",
    ].join("\n"),
  });
}

function updateSettings(patch) {
  settings = mergeSettings(settings, patch);
  saveSettings();
  scheduleRefresh();
  updateMenu({ loading: isRefreshing });
  broadcastStatus({ loading: isRefreshing });
  return { ...settings };
}

function scheduleRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (smokeMode) return;
  refreshTimer = setInterval(refreshStatus, settings.refreshIntervalMinutes * 60 * 1000);
  refreshTimer.unref?.();
}

function createStatusWindow() {
  statusWindow = new BrowserWindow({
    width: 320,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: "#203a52",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  statusWindow.loadFile(path.join(__dirname, "window.html"));
  statusWindow.on("blur", () => {
    if (previewMode) return;
    if (!statusWindow.isDestroyed()) statusWindow.hide();
  });
}

function waitForWindowLoad(browserWindow) {
  return new Promise((resolve, reject) => {
    if (!browserWindow || browserWindow.isDestroyed()) {
      reject(new Error("status window is not available"));
      return;
    }
    if (!browserWindow.webContents.isLoading()) {
      resolve();
      return;
    }
    browserWindow.webContents.once("did-finish-load", resolve);
    browserWindow.webContents.once("did-fail-load", (_event, code, description) => {
      reject(new Error(`window load failed ${code}: ${description}`));
    });
  });
}

async function runUiSmoke() {
  await waitForWindowLoad(statusWindow);
  const result = await statusWindow.webContents.executeJavaScript(`
    (async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      document.getElementById("settingsButton").click();
      await delay(80);
      const title = document.getElementById("detailTitle").textContent;
      const select = document.querySelector(".select-control");
      select.value = "10";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await delay(120);
      const firstToggle = document.querySelector(".toggle-switch input");
      firstToggle.click();
      await delay(120);
      document.getElementById("settingsButton").click();
      await delay(80);
      const settingsResult = {
        title,
        selectValue: document.querySelector(".select-control").value,
        toggleCount: document.querySelectorAll(".toggle-switch input").length,
        quotaHidden: document.getElementById("quotaSection").hidden,
        homeVisibleAfterToggle: !document.getElementById("homeView").hidden,
        detailHiddenAfterToggle: document.getElementById("detailView").hidden,
        settingsButtonText: document.getElementById("settingsButton").textContent,
      };
      render({
        loading: false,
        settings: {
          refreshIntervalMinutes: 5,
          showQuotaMeters: true,
          showResetCredits: true,
          showApiEquivalent: true,
          showRecentSessions: true,
          notificationsEnabled: false,
        },
        snapshot: {
          generatedAt: "2026-07-02T14:36:00Z",
          auth: { isAvailable: true, tokenState: "available", accountId: "acct_1234567890abcdef" },
          quota: {
            plan: "plus",
            primary: { remainingPercent: 92, secondsUntilReset: 3600, resetsAt: "2026-07-02T15:36:00Z" },
            additional: [],
          },
          resetCredits: {
            availableCount: 4,
            totalCount: 4,
            nextExpiresAt: "2026-07-18T00:41:00Z",
            secondsUntilNextExpiry: 1325100,
            updatedAt: "2026-07-02T14:32:00Z",
            credits: [
              {
                id: "ratelimit_reset_aaaaaaaa3a87",
                status: "available",
                risk: "available",
                expiresAt: "2026-07-18T00:41:00Z",
                remainingSeconds: 1325100,
              },
              {
                id: "ratelimit_reset_bbbbbbbb4b91",
                status: "available",
                risk: "available",
                expiresAt: "2026-07-18T00:42:00Z",
                remainingSeconds: 1325160,
              },
            ],
          },
          sessions: null,
          recentSessions: [],
          apiEquivalent: null,
          errors: [],
        },
      });
      await delay(80);
      document.getElementById("resetCard").click();
      await delay(80);
      const resetResult = {
        resetHasSummary: Boolean(document.querySelector("#detailContent .reset-summary")),
        resetMetricGridCount: document.querySelectorAll("#detailContent .metric-grid").length,
        resetRowCount: document.querySelectorAll("#detailContent .reset-credit-row").length,
        resetFirstSideText: document.querySelector("#detailContent .reset-credit-side")?.textContent || "",
      };
      render({
        loading: false,
        settings: {
          refreshIntervalMinutes: 5,
          showQuotaMeters: true,
          showResetCredits: true,
          showApiEquivalent: true,
          showRecentSessions: true,
          notificationsEnabled: false,
        },
        snapshot: {
          generatedAt: "2026-07-02T14:37:00Z",
          auth: { isAvailable: true, tokenState: "available", accountId: "acct_1234567890abcdef" },
          quota: null,
          resetCredits: null,
          sessions: null,
          recentSessions: [],
          apiEquivalent: null,
          errors: [{
            area: "quota",
            message: "The operation could not be completed. (NSURLErrorDomain error -1001.)",
          }],
        },
      });
      await delay(80);
      return {
        ...settingsResult,
        ...resetResult,
        errorPanelText: document.getElementById("errorPanel").textContent,
      };
    })();
  `, true);
  if (result.title !== "设置") throw new Error(`settings title mismatch: ${result.title}`);
  if (result.selectValue !== "10") throw new Error(`refresh interval did not update: ${result.selectValue}`);
  if (result.toggleCount < 5) throw new Error(`expected 5 setting toggles, got ${result.toggleCount}`);
  if (result.quotaHidden !== true) throw new Error("display toggle did not hide quota section");
  if (!result.homeVisibleAfterToggle || !result.detailHiddenAfterToggle) {
    throw new Error("settings button did not toggle back to home");
  }
  if (!result.settingsButtonText.includes("设置")) {
    throw new Error(`settings button label did not reset: ${result.settingsButtonText}`);
  }
  if (!result.resetHasSummary) throw new Error("reset detail did not render compact summary");
  if (result.resetMetricGridCount !== 0) throw new Error("reset detail still renders metric cards");
  if (result.resetRowCount !== 2) throw new Error(`reset detail row count mismatch: ${result.resetRowCount}`);
  if (!result.resetFirstSideText.startsWith("15天")) {
    throw new Error(`reset status order is not time-first: ${result.resetFirstSideText}`);
  }
  if (!result.errorPanelText.includes("配额：请求超时，请稍后刷新")) {
    throw new Error(`timeout error text is not friendly: ${result.errorPanelText}`);
  }
  if (result.errorPanelText.includes("NSURLErrorDomain")) {
    throw new Error("timeout error leaked raw NSError text");
  }
  console.log("tray ui smoke ok");
}

function toggleStatusWindow() {
  if (!statusWindow || statusWindow.isDestroyed()) createStatusWindow();
  if (statusWindow.isVisible()) {
    statusWindow.hide();
    return;
  }
  positionStatusWindow();
  statusWindow.show();
  statusWindow.focus();
  broadcastStatus({ loading: isRefreshing });
}

function hideStatusWindow() {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.hide();
  }
}

function positionStatusWindow() {
  if (!tray || !statusWindow) return;
  const trayBounds = tray.getBounds();
  const windowBounds = statusWindow.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });
  const workArea = display.workArea;
  const x = Math.min(
    Math.max(workArea.x, Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)),
    workArea.x + workArea.width - windowBounds.width);
  const trayAboveMidline = trayBounds.y < workArea.y + workArea.height / 2;
  const y = trayAboveMidline
    ? trayBounds.y + trayBounds.height + 8
    : trayBounds.y - windowBounds.height - 8;
  statusWindow.setPosition(x, Math.min(Math.max(workArea.y, y), workArea.y + workArea.height - windowBounds.height), false);
}

function updateMenu({ loading = false } = {}) {
  if (!tray) return;
  const snapshot = latestSnapshot || {
    quota: null,
    sessions: null,
    errors: loading ? [{ area: "status", message: "loading" }] : [],
  };
  tray.setToolTip(formatTooltip(snapshot));
  const statusItems = formatStatusLines(snapshot).slice(0, 8).map((line) => ({
    label: line,
    enabled: false,
  }));
  const maintenanceEnabled = process.platform === "win32" && !maintenanceBusy;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Codex Runway", enabled: false },
    { type: "separator" },
    ...statusItems,
    { type: "separator" },
    { label: "打开面板", click: toggleStatusWindow },
    { label: loading ? "正在刷新..." : "立即刷新", enabled: !loading, click: refreshStatus },
    { type: "separator" },
    {
      label: maintenanceBusy ? "同步/修复会话执行中..." : "同步/修复会话",
      enabled: maintenanceEnabled,
      click: runSessionSyncFromMenu,
    },
    {
      label: "重启 Codex",
      enabled: maintenanceEnabled,
      click: () => runMaintenanceAction("重启 Codex", () => restartCodex()),
    },
    {
      label: "重启 VSCode",
      enabled: maintenanceEnabled,
      click: () => runMaintenanceAction("重启 VSCode", () => restartVSCode()),
    },
    { type: "separator" },
    { label: "打开 Codex 文件夹", click: () => shell.openPath(path.join(os.homedir(), ".codex")) },
    { label: "退出托盘", click: () => app.quit() },
  ]));
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.github.codex-runway.windows-tray");
  loadSettings();
  loadAlertState();
  tray = new Tray(trayIcon());
  if (!smokeMode || uiSmokeMode) {
    createStatusWindow();
    tray.on("click", toggleStatusWindow);
  }
  updateMenu({ loading: true });
  if (uiSmokeMode) {
    try {
      await runUiSmoke();
      app.exit(0);
    } catch (error) {
      console.error(error.message);
      app.exit(1);
    }
    return;
  }
  if (previewMode) toggleStatusWindow();
  await refreshStatus();
  if (smokeMode) {
    const refreshError = latestSnapshot?.errors?.find((error) => error.area === "tray.refresh");
    if (refreshError) {
      console.error(refreshError.message);
      app.exit(1);
      return;
    }
    console.log("tray smoke ok");
    app.exit(0);
    return;
  }
  scheduleRefresh();
});

ipcMain.handle("status:get", () => currentPayload({ loading: isRefreshing }));
ipcMain.handle("status:refresh", () => refreshStatus());
ipcMain.handle("settings:get", () => ({ ...settings }));
ipcMain.handle("settings:update", (_event, patch) => updateSettings(patch));
ipcMain.handle("app:openCodexFolder", () => shell.openPath(path.join(os.homedir(), ".codex")));
ipcMain.handle("app:closePanel", () => hideStatusWindow());

app.on("window-all-closed", () => {
  // Keep the tray process alive even though no BrowserWindow is created.
});

app.on("before-quit", () => {
  if (refreshTimer) clearInterval(refreshTimer);
});
