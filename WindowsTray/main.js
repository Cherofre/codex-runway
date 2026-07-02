const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } = require("electron");
const { execFile } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const {
  buildCliEnvironment,
  buildCliInvocation,
  formatStatusLines,
  formatTooltip,
} = require("./status");

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, "..");
const smokeMode = process.env.CODEX_RUNWAY_TRAY_SMOKE === "1" || process.argv.includes("--smoke");
const previewMode = process.env.CODEX_RUNWAY_TRAY_PREVIEW === "1" || process.argv.includes("--show");
let tray = null;
let statusWindow = null;
let latestSnapshot = null;
let isRefreshing = false;

function iconPath() {
  return path.join(repoRoot, "Resources", "AppIcon.png");
}

function trayIcon() {
  const image = nativeImage.createFromPath(iconPath());
  return image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 });
}

async function refreshStatus() {
  if (isRefreshing) return currentPayload({ loading: true });
  isRefreshing = true;
  updateMenu({ loading: true });
  broadcastStatus({ loading: true });
  try {
    const invocation = buildCliInvocation({ repoRoot });
    const { stdout } = await execFileAsync(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: buildCliEnvironment(),
      timeout: 180_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    latestSnapshot = JSON.parse(stdout);
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
    snapshot: latestSnapshot || fallbackSnapshot({ loading }),
  };
}

function broadcastStatus({ loading = false } = {}) {
  if (!statusWindow || statusWindow.isDestroyed()) return;
  statusWindow.webContents.send("status-updated", currentPayload({ loading }));
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
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Codex Runway", enabled: false },
    { type: "separator" },
    ...statusItems,
    { type: "separator" },
    { label: "Open Panel", click: toggleStatusWindow },
    { label: loading ? "Refreshing..." : "Refresh Now", enabled: !loading, click: refreshStatus },
    { label: "Open Codex Folder", click: () => shell.openPath(path.join(os.homedir(), ".codex")) },
    { label: "Quit", click: () => app.quit() },
  ]));
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.github.codex-runway.windows-tray");
  tray = new Tray(trayIcon());
  if (!smokeMode) {
    createStatusWindow();
    tray.on("click", toggleStatusWindow);
  }
  updateMenu({ loading: true });
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
  setInterval(refreshStatus, 5 * 60 * 1000).unref();
});

ipcMain.handle("status:get", () => currentPayload({ loading: isRefreshing }));
ipcMain.handle("status:refresh", () => refreshStatus());
ipcMain.handle("app:openCodexFolder", () => shell.openPath(path.join(os.homedir(), ".codex")));
ipcMain.handle("app:closePanel", () => hideStatusWindow());

app.on("window-all-closed", () => {
  // Keep the tray process alive even though no BrowserWindow is created.
});
