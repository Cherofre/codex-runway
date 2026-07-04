const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } = require("electron");
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
const { buildStatusExportPath, writeStatusSnapshot } = require("./statusExport");
const { buildLoginItemSettings } = require("./startup");
const { checkForUpdates } = require("./updates");

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, "..");
const smokeMode = process.env.CODEX_RUNWAY_TRAY_SMOKE === "1" || process.argv.includes("--smoke");
const uiSmokeMode = process.env.CODEX_RUNWAY_TRAY_UI_SMOKE === "1" || process.argv.includes("--ui-smoke");
const previewMode = process.env.CODEX_RUNWAY_TRAY_PREVIEW === "1" || process.argv.includes("--show");
const projectUrl = "https://github.com/Licoy/codex-runway";
const feedbackUrl = "https://github.com/Licoy/codex-runway/issues/new";
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
let updateCheckBusy = false;

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
    exportStatusIfEnabled(latestSnapshot);
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
    exportStatusIfEnabled(latestSnapshot);
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
    appInfo: buildAppInfo(),
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

function appendSnapshotError(area, message) {
  latestSnapshot = {
    ...(latestSnapshot || fallbackSnapshot()),
    errors: [
      ...((latestSnapshot && latestSnapshot.errors) || []),
      { area, message },
    ],
  };
}

function exportStatusIfEnabled(snapshot = latestSnapshot) {
  if (!settings.exportsStatusJSON || !snapshot) return null;
  try {
    return writeStatusSnapshot(snapshot);
  } catch (error) {
    appendSnapshotError("status.export", error.message);
    return null;
  }
}

function buildAppInfo() {
  return {
    version: app.getVersion(),
    platform: process.platform,
    mode: app.isPackaged ? "packaged" : previewMode ? "preview" : "development",
    userDataPath: app.getPath("userData"),
    statusExportPath: buildStatusExportPath(),
    projectUrl,
    feedbackUrl,
  };
}

function loginItemSettings(openAtLogin) {
  return buildLoginItemSettings({
    openAtLogin,
    execPath: process.execPath,
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
  });
}

function applyStartupSetting(openAtLogin) {
  if (process.platform !== "win32" || smokeMode || uiSmokeMode) return;
  try {
    app.setLoginItemSettings(loginItemSettings(openAtLogin));
  } catch (error) {
    appendSnapshotError("settings.startup", error.message);
  }
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
  if (patch && Object.hasOwn(patch, "startAtLogin")) {
    applyStartupSetting(settings.startAtLogin);
  }
  if (patch && Object.hasOwn(patch, "exportsStatusJSON") && settings.exportsStatusJSON) {
    exportStatusIfEnabled();
  }
  saveSettings();
  scheduleRefresh();
  updateMenu({ loading: isRefreshing });
  broadcastStatus({ loading: isRefreshing });
  return { ...settings };
}

function testNotification() {
  showSystemNotice("Codex Runway", "测试通知已触发");
  return {
    summary: "测试通知已触发",
    supported: typeof Notification.isSupported !== "function" || Notification.isSupported(),
  };
}

async function openStatusFolder() {
  const target = path.dirname(buildStatusExportPath());
  fs.mkdirSync(target, { recursive: true });
  const error = await shell.openPath(target);
  return { target, ok: !error, error };
}

function openProjectUrl() {
  shell.openExternal(projectUrl);
  return { url: projectUrl };
}

function openFeedbackUrl() {
  shell.openExternal(feedbackUrl);
  return { url: feedbackUrl };
}

async function runUpdateCheck({ silent = false } = {}) {
  if (updateCheckBusy) return { status: "busy", summary: "正在检查更新", detail: "" };
  updateCheckBusy = true;
  updateMenu({ loading: isRefreshing });
  try {
    const result = await checkForUpdates({ currentVersion: app.getVersion() });
    if (!silent || result.status === "newer") {
      const buttons = result.status === "newer" ? ["打开发布页", "稍后"] : ["确定"];
      const answer = await showDialog({
        type: result.status === "newer" ? "info" : result.status === "error" ? "error" : "none",
        buttons,
        defaultId: 0,
        cancelId: result.status === "newer" ? 1 : 0,
        message: result.summary,
        detail: result.detail || "",
      });
      if (result.status === "newer" && answer.response === 0 && result.url) {
        shell.openExternal(result.url);
      }
    }
    return result;
  } finally {
    updateCheckBusy = false;
    updateMenu({ loading: isRefreshing });
  }
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
      const appearanceSelect = document.querySelector('[data-setting="appearance"]');
      appearanceSelect.value = "light";
      appearanceSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await delay(120);
      const refreshSelect = document.querySelector('[data-setting="refreshIntervalMinutes"]');
      refreshSelect.value = "10";
      refreshSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await delay(120);
      const firstToggle = document.querySelector(".toggle-switch input");
      firstToggle.click();
      await delay(120);
      const exportToggle = document.querySelector('[data-setting="exportsStatusJSON"]');
      exportToggle.click();
      await delay(120);
      document.getElementById("settingsButton").click();
      await delay(80);
      const settingsResult = {
        title,
        selectValue: document.querySelector('[data-setting="refreshIntervalMinutes"]').value,
        appearanceValue: document.querySelector('[data-setting="appearance"]').value,
        themeMode: document.documentElement.dataset.theme,
        exportChecked: document.querySelector('[data-setting="exportsStatusJSON"]').checked,
        toggleCount: document.querySelectorAll(".toggle-switch input").length,
        actionCount: document.querySelectorAll(".action-button").length,
        quotaHidden: document.getElementById("quotaSection").hidden,
        homeVisibleAfterToggle: !document.getElementById("homeView").hidden,
        detailHiddenAfterToggle: document.getElementById("detailView").hidden,
        settingsButtonText: document.getElementById("settingsButton").textContent,
      };
      render({
        loading: false,
        settings: {
          refreshIntervalMinutes: 5,
          appearance: "system",
          showQuotaMeters: true,
          showResetCredits: true,
          showApiEquivalent: true,
          showRecentSessions: true,
          notificationsEnabled: false,
          startAtLogin: false,
          autoCheckUpdates: false,
          exportsStatusJSON: false,
        },
        snapshot: {
          generatedAt: "2026-07-02T14:36:00Z",
          auth: { isAvailable: true, tokenState: "available", accountId: "acct_1234567890abcdef" },
          quota: {
            plan: "plus",
            primary: { remainingPercent: 92, secondsUntilReset: 3600, resetsAt: "2026-07-02T15:36:00Z" },
            secondary: { remainingPercent: 41, secondsUntilReset: 345600, resetsAt: "2026-07-06T00:00:00Z" },
            additional: [{
              name: "GPT-5.3-Codex-Spark",
              window: { remainingPercent: 100, secondsUntilReset: 7200, resetsAt: "2026-07-02T16:36:00Z" },
            }],
            creditsBalance: 12.5,
            updatedAt: "2026-07-02T14:32:00Z",
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
          sessions: {
            plannedEntries: 325,
            missingCount: 163,
            orphanCount: 88,
            duplicateCount: 2,
            staleTitleCount: 7,
          },
          recentSessions: [
            {
              id: "session_windows_tray_polish_0001",
              title: "Windows tray polish",
              projectName: "codex-runway",
              updatedAt: "2026-07-02T14:30:00Z",
              state: "recent",
              totalTokens: 12345,
              estimatedUSD: 1.2345,
            },
            {
              id: "session_settings_detail_0002",
              title: "Settings detail polish",
              projectName: "codex-runway",
              updatedAt: "2026-07-01T10:15:00Z",
              state: "missing",
              totalTokens: 980000,
              estimatedUSD: 45.67,
            },
          ],
          apiEquivalent: {
            source: "localSessions",
            confidence: "estimated",
            totalTokens: 992345,
            estimatedUSD: 46.9045,
            pricingVersion: "2026-06-29",
            calculatedAt: "2026-07-02T14:35:00Z",
            windowStart: "2026-06-29T00:00:00Z",
            windowEnd: "2026-07-02T14:35:00Z",
          },
          errors: [],
        },
      });
      await delay(80);
      document.querySelector(".quota-item").click();
      await delay(80);
      const quotaDetailResult = {
        quotaDetailTitle: document.getElementById("detailTitle").textContent,
        quotaDetailRows: document.querySelectorAll("#detailContent .detail-row").length,
        quotaWindowCards: document.querySelectorAll("#detailContent .quota-window-card").length,
        quotaCreditBalance: document.getElementById("detailContent").textContent.includes("12.5"),
      };
      document.getElementById("backButton").click();
      await delay(80);
      document.querySelector(".session-item").click();
      await delay(80);
      const recentDetailResult = {
        recentDetailTitle: document.getElementById("detailTitle").textContent,
        recentDetailRows: document.querySelectorAll("#detailContent .session-detail-row").length,
        recentMetricCards: document.querySelectorAll("#detailContent .metric-card").length,
        recentExactTime: document.getElementById("detailContent").textContent.includes("2026"),
        recentFullId: document.getElementById("detailContent").textContent.includes("session_windows_tray_polish_0001"),
      };
      document.getElementById("backButton").click();
      await delay(80);
      document.getElementById("resetCard").click();
      await delay(80);
      const resetResult = {
        resetHasSummary: Boolean(document.querySelector("#detailContent .reset-summary")),
        resetMetricGridCount: document.querySelectorAll("#detailContent .metric-grid").length,
        resetRowCount: document.querySelectorAll("#detailContent .reset-credit-row").length,
        resetFirstSideText: document.querySelector("#detailContent .reset-credit-side")?.textContent || "",
        resetCreatedRows: document.querySelectorAll("#detailContent .reset-credit-extra").length,
      };
      document.getElementById("backButton").click();
      await delay(80);
      document.getElementById("apiCard").click();
      await delay(80);
      const apiResult = {
        apiMetricCards: document.querySelectorAll("#detailContent .metric-card").length,
        apiExplainerRows: document.querySelectorAll("#detailContent .api-explainer-row").length,
        apiWindowText: document.getElementById("detailContent").textContent.includes("2026-06-29"),
      };
      render({
        loading: false,
        settings: {
          refreshIntervalMinutes: 5,
          appearance: "system",
          showQuotaMeters: true,
          showResetCredits: true,
          showApiEquivalent: true,
          showRecentSessions: true,
          notificationsEnabled: false,
          startAtLogin: false,
          autoCheckUpdates: false,
          exportsStatusJSON: false,
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
      const errorPanel = document.getElementById("errorPanel");
      const errorPanelText = errorPanel.textContent;
      const errorPanelTag = errorPanel.tagName;
      errorPanel.click();
      await delay(80);
      const diagnosticsResult = {
        errorPanelText,
        errorPanelTag,
        diagnosticsTitle: document.getElementById("detailTitle").textContent,
        diagnosticsRows: document.querySelectorAll("#detailContent .detail-row").length,
        diagnosticsActions: document.querySelectorAll("#detailContent .diagnostic-actions .action-button").length,
        diagnosticsSafeNote: document.getElementById("detailContent").textContent.includes("不包含 token"),
      };
      return {
        ...settingsResult,
        ...quotaDetailResult,
        ...recentDetailResult,
        ...resetResult,
        ...apiResult,
        ...diagnosticsResult,
      };
    })();
  `, true);
  if (result.title !== "设置") throw new Error(`settings title mismatch: ${result.title}`);
  if (result.selectValue !== "10") throw new Error(`refresh interval did not update: ${result.selectValue}`);
  if (result.appearanceValue !== "light") throw new Error(`appearance did not update: ${result.appearanceValue}`);
  if (result.themeMode !== "light") throw new Error(`theme mode did not apply: ${result.themeMode}`);
  if (!result.exportChecked) throw new Error("status JSON export toggle did not update");
  if (result.toggleCount < 8) throw new Error(`expected 8 setting toggles, got ${result.toggleCount}`);
  if (result.actionCount < 6) throw new Error(`expected settings action buttons, got ${result.actionCount}`);
  if (result.quotaHidden !== true) throw new Error("display toggle did not hide quota section");
  if (!result.homeVisibleAfterToggle || !result.detailHiddenAfterToggle) {
    throw new Error("settings button did not toggle back to home");
  }
  if (!result.settingsButtonText.includes("设置")) {
    throw new Error(`settings button label did not reset: ${result.settingsButtonText}`);
  }
  if (!result.resetHasSummary) throw new Error("reset detail did not render compact summary");
  if (result.quotaDetailTitle !== "配额详情") throw new Error(`quota detail title mismatch: ${result.quotaDetailTitle}`);
  if (result.quotaDetailRows < 2) throw new Error(`quota detail rows missing: ${result.quotaDetailRows}`);
  if (result.quotaWindowCards < 3) throw new Error(`quota window cards missing: ${result.quotaWindowCards}`);
  if (!result.quotaCreditBalance) throw new Error("quota detail did not expose credits balance");
  if (result.recentDetailTitle !== "最近会话") throw new Error(`recent detail title mismatch: ${result.recentDetailTitle}`);
  if (result.recentDetailRows < 1) throw new Error(`recent detail rows missing: ${result.recentDetailRows}`);
  if (result.recentMetricCards < 4) throw new Error(`recent summary metrics missing: ${result.recentMetricCards}`);
  if (!result.recentExactTime) throw new Error("recent detail did not expose exact timestamps");
  if (!result.recentFullId) throw new Error("recent detail did not expose full session ids");
  if (result.resetMetricGridCount !== 0) throw new Error("reset detail still renders metric cards");
  if (result.resetRowCount !== 2) throw new Error(`reset detail row count mismatch: ${result.resetRowCount}`);
  if (result.resetCreatedRows < 2) throw new Error(`reset detail missing per-credit extra rows: ${result.resetCreatedRows}`);
  if (!result.resetFirstSideText.startsWith("15天")) {
    throw new Error(`reset status order is not time-first: ${result.resetFirstSideText}`);
  }
  if (result.apiMetricCards < 4) throw new Error(`api metric cards missing: ${result.apiMetricCards}`);
  if (result.apiExplainerRows < 3) throw new Error(`api explainer rows missing: ${result.apiExplainerRows}`);
  if (!result.apiWindowText) throw new Error("api detail did not expose exact window dates");
  if (!result.errorPanelText.includes("配额：请求超时，请稍后刷新")) {
    throw new Error(`timeout error text is not friendly: ${result.errorPanelText}`);
  }
  if (result.errorPanelText.includes("NSURLErrorDomain")) {
    throw new Error("timeout error leaked raw NSError text");
  }
  if (result.errorPanelTag !== "BUTTON") throw new Error(`error panel is not clickable: ${result.errorPanelTag}`);
  if (result.diagnosticsTitle !== "诊断与恢复") {
    throw new Error(`diagnostics title mismatch: ${result.diagnosticsTitle}`);
  }
  if (result.diagnosticsRows < 3) throw new Error(`diagnostics rows missing: ${result.diagnosticsRows}`);
  if (result.diagnosticsActions < 4) throw new Error(`diagnostics actions missing: ${result.diagnosticsActions}`);
  if (!result.diagnosticsSafeNote) throw new Error("diagnostics page does not mention token-safe copy");
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
    {
      label: updateCheckBusy ? "正在检查更新..." : "检查更新",
      enabled: !updateCheckBusy,
      click: () => runUpdateCheck(),
    },
    { type: "separator" },
    { label: "打开状态 JSON 目录", click: openStatusFolder },
    { label: "打开 GitHub 项目", click: openProjectUrl },
    { label: "反馈 Issue", click: openFeedbackUrl },
    { type: "separator" },
    { label: "打开 Codex 文件夹", click: () => shell.openPath(path.join(os.homedir(), ".codex")) },
    { label: "退出托盘", click: () => app.quit() },
  ]));
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.github.codex-runway.windows-tray");
  loadSettings();
  applyStartupSetting(settings.startAtLogin);
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
  if (settings.autoCheckUpdates && !smokeMode) {
    runUpdateCheck({ silent: true });
  }
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
ipcMain.handle("updates:check", () => runUpdateCheck());
ipcMain.handle("notifications:test", () => testNotification());
ipcMain.handle("diagnostics:copy", (_event, text) => {
  const value = String(text || "");
  clipboard.writeText(value);
  return { copied: true, length: value.length };
});
ipcMain.handle("app:getInfo", () => buildAppInfo());
ipcMain.handle("app:openCodexFolder", () => shell.openPath(path.join(os.homedir(), ".codex")));
ipcMain.handle("app:openStatusFolder", () => openStatusFolder());
ipcMain.handle("app:openGitHub", () => openProjectUrl());
ipcMain.handle("app:openFeedback", () => openFeedbackUrl());
ipcMain.handle("app:closePanel", () => hideStatusWindow());

app.on("window-all-closed", () => {
  // Keep the tray process alive even though no BrowserWindow is created.
});

app.on("before-quit", () => {
  if (refreshTimer) clearInterval(refreshTimer);
});
