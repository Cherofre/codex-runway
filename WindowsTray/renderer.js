const elements = {
  accountText: document.getElementById("accountText"),
  apiCard: document.getElementById("apiCard"),
  apiDetail: document.getElementById("apiDetail"),
  apiTitle: document.getElementById("apiTitle"),
  closeButton: document.getElementById("closeButton"),
  closePanelButton: document.getElementById("closePanelButton"),
  errorPanel: document.getElementById("errorPanel"),
  backButton: document.getElementById("backButton"),
  detailContent: document.getElementById("detailContent"),
  detailSubtitle: document.getElementById("detailSubtitle"),
  detailTitle: document.getElementById("detailTitle"),
  detailView: document.getElementById("detailView"),
  homeView: document.getElementById("homeView"),
  openFolderButton: document.getElementById("openFolderButton"),
  planChip: document.getElementById("planChip"),
  quotaList: document.getElementById("quotaList"),
  quotaSection: document.getElementById("quotaSection"),
  recentSessions: document.getElementById("recentSessions"),
  recentSection: document.getElementById("recentSection"),
  refreshButton: document.getElementById("refreshButton"),
  resetCard: document.getElementById("resetCard"),
  resetDetail: document.getElementById("resetDetail"),
  resetTitle: document.getElementById("resetTitle"),
  sessionSummary: document.getElementById("sessionSummary"),
  settingsButton: document.getElementById("settingsButton"),
  summaryCards: document.getElementById("summaryCards"),
  updatedText: document.getElementById("updatedText"),
};

const allowedRefreshIntervals = [1, 5, 10, 30];
const allowedAppearances = ["system", "dark", "light"];
const defaultSettings = {
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
};

let latestPayload = null;
let currentView = "home";
let settings = { ...defaultSettings };
let appInfo = {
  version: "--",
  platform: "win32",
  mode: "development",
  statusExportPath: "",
  projectUrl: "",
  feedbackUrl: "",
};

function render(payload) {
  latestPayload = payload;
  settings = normalizeSettings(payload?.settings || settings);
  appInfo = normalizeAppInfo(payload?.appInfo || appInfo);
  applyAppearance();
  const snapshot = payload?.snapshot || {};
  const quota = snapshot.quota;
  elements.refreshButton.classList.toggle("loading", Boolean(payload?.loading));
  elements.planChip.textContent = planLabel(quota?.plan);
  elements.accountText.textContent = accountLabel(snapshot.auth?.accountId, snapshot.auth?.tokenState);
  elements.updatedText.textContent = snapshot.generatedAt ? relativeTime(snapshot.generatedAt) : "--";
  renderQuota(quota);
  renderReset(snapshot.resetCredits);
  renderApi(snapshot.apiEquivalent);
  renderSessions(snapshot);
  renderErrors(snapshot.errors || []);
  applySettingsVisibility();
  if (currentView === "reset") renderResetDetail(snapshot);
  if (currentView === "api") renderApiDetail(snapshot);
  if (currentView === "quota") renderQuotaDetail(snapshot);
  if (currentView === "recent") renderRecentDetail(snapshot);
  if (currentView === "settings") renderSettingsDetail();
}

function renderQuota(quota) {
  elements.quotaList.replaceChildren();
  if (!quota?.primary) {
    elements.quotaList.append(emptyState("配额暂不可用"));
    return;
  }

  const windows = [
    ["5 小时", quota.primary],
    quota.secondary ? ["每周", quota.secondary] : null,
    ...(quota.additional || []).map((item) => [item.name, item.window]),
  ].filter(Boolean);

  for (const [label, window] of windows) {
    elements.quotaList.append(quotaItem(label, window));
  }
}

function quotaItem(label, window) {
  const remaining = clampPercent(window.remainingPercent);
  const item = document.createElement("button");
  item.type = "button";
  item.className = "quota-item";
  item.addEventListener("click", showQuotaDetail);

  const line = document.createElement("div");
  line.className = "quota-line";
  line.append(textNode("span", label));
  line.append(textNode("span", `${remaining}% 剩余`));

  const track = document.createElement("div");
  track.className = "progress-track";
  const fill = document.createElement("div");
  fill.className = "progress-fill";
  fill.style.setProperty("--value", `${remaining}%`);
  track.append(fill);

  const meta = document.createElement("div");
  meta.className = "quota-meta";
  meta.append(textNode("span", resetLabel(window.secondsUntilReset)));
  meta.append(textNode("span", window.resetsAt ? `重置 ${shortDate(window.resetsAt)}` : ""));

  item.append(line, track, meta);
  return item;
}

function renderReset(resetCredits) {
  if (!resetCredits) {
    elements.resetTitle.textContent = "重置次数不可用";
    elements.resetDetail.textContent = "等待下一次刷新";
    return;
  }
  elements.resetTitle.textContent = `${resetCredits.availableCount} 可用重置`;
  elements.resetDetail.textContent = `总数 ${resetCredits.totalCount} · ${resetLabel(resetCredits.secondsUntilNextExpiry)}`;
}

function renderApi(apiEquivalent) {
  if (!apiEquivalent) {
    elements.apiTitle.textContent = "$--";
    elements.apiDetail.textContent = "API 等价成本不可用";
    return;
  }
  elements.apiTitle.textContent = formatMoney(apiEquivalent.estimatedUSD);
  elements.apiDetail.textContent = `${formatTokens(apiEquivalent.totalTokens)} Tokens · 本地会话`;
}

function renderSessions(snapshot) {
  elements.recentSessions.replaceChildren();
  const sessions = snapshot.recentSessions || [];
  const summary = snapshot.sessions;
  elements.sessionSummary.textContent = summary
    ? `${summary.plannedEntries} 已索引`
    : `${sessions.length} 条`;

  if (sessions.length === 0) {
    elements.recentSessions.append(emptyState("最近会话为空"));
    return;
  }

  for (const item of sessions.slice(0, 5)) {
    elements.recentSessions.append(sessionItem(item));
  }
}

function sessionItem(item) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "session-item";
  row.addEventListener("click", showRecentDetail);

  const dot = document.createElement("span");
  dot.className = "dot";

  const main = document.createElement("div");
  main.className = "session-main";
  const title = textNode("div", item.title || item.projectName || "Untitled");
  title.className = "session-title";
  const meta = textNode(
    "div",
    `${item.projectName || "local"} · ${formatTokens(item.totalTokens)} Tokens · ${relativeTime(item.updatedAt)}`);
  meta.className = "session-meta";
  main.append(title, meta);

  const cost = textNode("div", formatMoney(item.estimatedUSD));
  cost.className = "session-cost";

  row.append(dot, main, cost);
  return row;
}

function renderErrors(errors) {
  if (!errors.length) {
    elements.errorPanel.hidden = true;
    elements.errorPanel.textContent = "";
    return;
  }
  elements.errorPanel.hidden = false;
  const formatErrorLine = window.runwayErrors?.formatErrorLine ||
    ((error) => `${error.area}: ${error.message}`);
  elements.errorPanel.textContent = errors.slice(0, 2).map(formatErrorLine).join(" · ");
}

function normalizeSettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const refreshIntervalMinutes = allowedRefreshIntervals.includes(Number(source.refreshIntervalMinutes))
    ? Number(source.refreshIntervalMinutes)
    : defaultSettings.refreshIntervalMinutes;
  return {
    refreshIntervalMinutes,
    appearance: allowedAppearances.includes(source.appearance)
      ? source.appearance
      : defaultSettings.appearance,
    showQuotaMeters: typeof source.showQuotaMeters === "boolean"
      ? source.showQuotaMeters
      : defaultSettings.showQuotaMeters,
    showResetCredits: typeof source.showResetCredits === "boolean"
      ? source.showResetCredits
      : defaultSettings.showResetCredits,
    showApiEquivalent: typeof source.showApiEquivalent === "boolean"
      ? source.showApiEquivalent
      : defaultSettings.showApiEquivalent,
    showRecentSessions: typeof source.showRecentSessions === "boolean"
      ? source.showRecentSessions
      : defaultSettings.showRecentSessions,
    notificationsEnabled: typeof source.notificationsEnabled === "boolean"
      ? source.notificationsEnabled
      : defaultSettings.notificationsEnabled,
    startAtLogin: typeof source.startAtLogin === "boolean"
      ? source.startAtLogin
      : defaultSettings.startAtLogin,
    autoCheckUpdates: typeof source.autoCheckUpdates === "boolean"
      ? source.autoCheckUpdates
      : defaultSettings.autoCheckUpdates,
    exportsStatusJSON: typeof source.exportsStatusJSON === "boolean"
      ? source.exportsStatusJSON
      : defaultSettings.exportsStatusJSON,
  };
}

function normalizeAppInfo(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    version: String(source.version || "--"),
    platform: String(source.platform || "win32"),
    mode: String(source.mode || "development"),
    userDataPath: String(source.userDataPath || ""),
    statusExportPath: String(source.statusExportPath || ""),
    projectUrl: String(source.projectUrl || ""),
    feedbackUrl: String(source.feedbackUrl || ""),
  };
}

function applyAppearance() {
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.dataset.theme = settings.appearance === "system" ? systemTheme : settings.appearance;
  document.documentElement.dataset.preference = settings.appearance;
}

function applySettingsVisibility() {
  elements.quotaSection.hidden = !settings.showQuotaMeters;
  elements.resetCard.hidden = !settings.showResetCredits;
  elements.apiCard.hidden = !settings.showApiEquivalent;
  elements.summaryCards.hidden = !settings.showResetCredits && !settings.showApiEquivalent;
  elements.recentSection.hidden = !settings.showRecentSessions;
}

async function applySettingsPatch(patch) {
  settings = normalizeSettings({ ...settings, ...patch });
  applyAppearance();
  applySettingsVisibility();
  if (currentView === "settings") renderSettingsDetail();
  try {
    settings = normalizeSettings(await window.runway.updateSettings(patch));
    applyAppearance();
    applySettingsVisibility();
    if (currentView === "settings") renderSettingsDetail();
  } catch (error) {
    renderErrors([{ area: "settings.save", message: error.message }]);
  }
}

async function requestUpdateCheck() {
  try {
    await window.runway.checkForUpdates();
  } catch (error) {
    renderErrors([{ area: "updates.check", message: error.message }]);
  }
}

async function requestTestNotification() {
  try {
    await window.runway.testNotification();
  } catch (error) {
    renderErrors([{ area: "notifications.test", message: error.message }]);
  }
}

async function requestStatusFolder() {
  try {
    await window.runway.openStatusFolder();
  } catch (error) {
    renderErrors([{ area: "status.folder", message: error.message }]);
  }
}

async function requestGitHub() {
  try {
    await window.runway.openGitHub();
  } catch (error) {
    renderErrors([{ area: "links.github", message: error.message }]);
  }
}

async function requestFeedback() {
  try {
    await window.runway.openFeedback();
  } catch (error) {
    renderErrors([{ area: "links.feedback", message: error.message }]);
  }
}

function showHome() {
  currentView = "home";
  elements.detailView.hidden = true;
  elements.homeView.hidden = false;
  updateViewControls();
}

function showResetDetail() {
  currentView = "reset";
  elements.homeView.hidden = true;
  elements.detailView.hidden = false;
  updateViewControls();
  renderResetDetail(latestPayload?.snapshot || {});
}

function showApiDetail() {
  currentView = "api";
  elements.homeView.hidden = true;
  elements.detailView.hidden = false;
  updateViewControls();
  renderApiDetail(latestPayload?.snapshot || {});
}

function showQuotaDetail() {
  currentView = "quota";
  elements.homeView.hidden = true;
  elements.detailView.hidden = false;
  updateViewControls();
  renderQuotaDetail(latestPayload?.snapshot || {});
}

function showRecentDetail() {
  currentView = "recent";
  elements.homeView.hidden = true;
  elements.detailView.hidden = false;
  updateViewControls();
  renderRecentDetail(latestPayload?.snapshot || {});
}

function showSettings() {
  currentView = "settings";
  elements.homeView.hidden = true;
  elements.detailView.hidden = false;
  updateViewControls();
  renderSettingsDetail();
}

function toggleSettings() {
  if (currentView === "settings") {
    showHome();
    return;
  }
  showSettings();
}

function updateViewControls() {
  elements.settingsButton.textContent = currentView === "settings" ? "‹ 返回" : "☷ 设置";
  elements.backButton.hidden = currentView === "settings";
}

function renderResetDetail(snapshot) {
  const reset = snapshot.resetCredits;
  elements.detailTitle.textContent = "重置次数详情";
  elements.detailSubtitle.textContent = reset ? `${reset.availableCount}/${reset.totalCount} 可用` : "数据暂不可用";
  elements.detailContent.replaceChildren();
  if (!reset) {
    elements.detailContent.append(emptyState("重置次数暂不可用"));
    return;
  }
  elements.detailContent.append(
    resetSummary(reset, snapshot),
    resetCreditList(reset.credits || []),
    detailNote("最早到期的可用次数排在最上方。"));
}

function renderApiDetail(snapshot) {
  const api = snapshot.apiEquivalent;
  elements.detailTitle.textContent = "API 等价成本";
  elements.detailSubtitle.textContent = api ? `${sourceLabel(api.source)} · ${confidenceLabel(api.confidence)}` : "数据暂不可用";
  elements.detailContent.replaceChildren();
  if (!api) {
    elements.detailContent.append(emptyState("API 等价成本暂不可用"));
    return;
  }
  elements.detailContent.append(
    metricGrid([
      ["估算成本", formatMoney(api.estimatedUSD)],
      ["Tokens", formatTokens(api.totalTokens)],
      ["计价版本", api.pricingVersion || "--"],
      ["置信度", confidenceLabel(api.confidence)],
    ]),
    detailTable([
      ["来源", sourceLabel(api.source)],
      ["窗口开始", exactDate(api.windowStart)],
      ["窗口结束", exactDate(api.windowEnd)],
      ["计算时间", exactDate(api.calculatedAt)],
    ]),
    apiExplainer(api),
    detailNote("这里按本机会话 JSONL 统计 API 等价成本，不上传会话内容。"));
}

function renderQuotaDetail(snapshot) {
  const quota = snapshot.quota;
  elements.detailTitle.textContent = "配额详情";
  elements.detailSubtitle.textContent = quota?.plan ? `${planLabel(quota.plan)} · ${relativeTime(snapshot.generatedAt)}` : "数据暂不可用";
  elements.detailContent.replaceChildren();
  if (!quota?.primary) {
    elements.detailContent.append(emptyState("配额暂不可用"));
    return;
  }

  const windows = quotaWindows(quota);
  const primary = quota.primary;
  elements.detailContent.append(
    metricGrid([
      ["5 小时剩余", `${clampPercent(primary.remainingPercent)}%`],
      ["5 小时重置", primary.secondsUntilReset == null ? "--" : compactDuration(primary.secondsUntilReset)],
      ["每周剩余", quota.secondary ? `${clampPercent(quota.secondary.remainingPercent)}%` : "--"],
      ["窗口数量", String(windows.length)],
    ]),
    quotaWindowList(windows),
    detailTable(windows.flatMap(({ label, window }) => [
      [`${label} 剩余`, `${clampPercent(window.remainingPercent)}%`],
      [`${label} 已用`, `${100 - clampPercent(window.remainingPercent)}%`],
      [`${label} 精确重置`, window.resetsAt ? exactDate(window.resetsAt) : resetLabel(window.secondsUntilReset)],
    ]).concat([
      ["Credits balance", quota.creditsBalance == null ? "--" : String(quota.creditsBalance)],
      ["更新时间", exactDate(quota.updatedAt)],
    ])),
    detailNote("配额详情来自 Codex 远端状态，只在本机托盘中展示。"));
}

function renderRecentDetail(snapshot) {
  const sessions = snapshot.recentSessions || [];
  elements.detailTitle.textContent = "最近会话";
  elements.detailSubtitle.textContent = snapshot.sessions
    ? `${snapshot.sessions.plannedEntries} 已索引 · ${snapshot.sessions.missingCount} 缺失 · ${snapshot.sessions.orphanCount} 孤立`
    : `${sessions.length} 条`;
  elements.detailContent.replaceChildren();
  if (sessions.length === 0) {
    elements.detailContent.append(emptyState("最近会话为空"));
    return;
  }

  const list = document.createElement("div");
  list.className = "session-detail-list";
  for (const item of sessions) {
    list.append(sessionDetailRow(item));
  }
  elements.detailContent.append(
    recentSummary(snapshot, sessions),
    list,
    detailNote("最近会话按本地 Codex JSONL 的更新时间排序，不上传会话内容。"));
}

function renderSettingsDetail() {
  elements.detailTitle.textContent = "设置";
  elements.detailSubtitle.textContent = "Windows 托盘 · 本机保存";
  elements.detailContent.replaceChildren();

  const appearanceSelect = document.createElement("select");
  appearanceSelect.className = "select-control appearance-select";
  appearanceSelect.dataset.setting = "appearance";
  appearanceSelect.setAttribute("aria-label", "主题");
  for (const [value, label] of [
    ["system", "跟随系统"],
    ["dark", "深色"],
    ["light", "浅色"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === settings.appearance;
    appearanceSelect.append(option);
  }
  appearanceSelect.addEventListener("change", () => {
    applySettingsPatch({ appearance: appearanceSelect.value });
  });

  const refreshSelect = document.createElement("select");
  refreshSelect.className = "select-control";
  refreshSelect.dataset.setting = "refreshIntervalMinutes";
  refreshSelect.setAttribute("aria-label", "刷新间隔");
  for (const minutes of allowedRefreshIntervals) {
    const option = document.createElement("option");
    option.value = String(minutes);
    option.textContent = `${minutes} 分钟`;
    option.selected = minutes === settings.refreshIntervalMinutes;
    refreshSelect.append(option);
  }
  refreshSelect.addEventListener("change", () => {
    applySettingsPatch({ refreshIntervalMinutes: Number(refreshSelect.value) });
  });

  elements.detailContent.append(
    settingsGroup("外观", [
      settingRow("主题", "面板外观会立即生效", appearanceSelect),
      settingRow("自动刷新", "托盘后台状态更新频率", refreshSelect),
    ]),
    settingsGroup("首页显示", [
      settingRow("配额进度", "5 小时、每周额度", toggleControl(settings.showQuotaMeters, (checked) => {
        applySettingsPatch({ showQuotaMeters: checked });
      })),
      settingRow("可用重置", "重置次数和单条明细入口", toggleControl(settings.showResetCredits, (checked) => {
        applySettingsPatch({ showResetCredits: checked });
      })),
      settingRow("API 等价成本", "本机会话 token 估算", toggleControl(settings.showApiEquivalent, (checked) => {
        applySettingsPatch({ showApiEquivalent: checked });
      })),
      settingRow("最近会话", "索引到的本地 Codex 会话", toggleControl(settings.showRecentSessions, (checked) => {
        applySettingsPatch({ showRecentSessions: checked });
      })),
    ]),
    settingsGroup("系统", [
      settingRow("关闭按钮", "隐藏面板，托盘仍保持运行", statusPill("已启用")),
      settingRow("开机启动", "登录 Windows 后自动启动托盘", toggleControl(settings.startAtLogin, (checked) => {
        applySettingsPatch({ startAtLogin: checked });
      })),
      settingRow("通知提醒", "配额阈值和重置临期", toggleControl(settings.notificationsEnabled, (checked) => {
        applySettingsPatch({ notificationsEnabled: checked });
      })),
      settingRow("测试通知", "发送一条 Windows 系统通知", actionButton("测试", requestTestNotification)),
      settingRow("自动检查更新", "启动托盘时检查 GitHub Release", toggleControl(settings.autoCheckUpdates, (checked) => {
        applySettingsPatch({ autoCheckUpdates: checked });
      })),
      settingRow("检查更新", "手动查看可用发布版本", actionButton("检查", requestUpdateCheck)),
    ]),
    settingsGroup("数据", [
      settingRow("导出状态 JSON", "~/.codex-runway/status.json", toggleControl(settings.exportsStatusJSON, (checked) => {
        applySettingsPatch({ exportsStatusJSON: checked });
      }, "exportsStatusJSON")),
      settingRow("状态 JSON 目录", appInfo.statusExportPath || "导出目录", actionButton("打开", requestStatusFolder)),
      settingRow("Codex 文件夹", "~/.codex", actionButton("打开", () => window.runway.openCodexFolder())),
    ]),
    settingsGroup("关于", [
      settingRow("版本", `平台 ${platformLabel(appInfo.platform)}`, statusPill(appInfo.version)),
      settingRow("运行模式", appInfo.userDataPath || "Electron userData", statusPill(modeLabel(appInfo.mode))),
      settingRow("GitHub 项目", "Licoy/codex-runway", actionButton("打开", requestGitHub)),
      settingRow("反馈 Issue", "提交问题或功能建议", actionButton("反馈", requestFeedback)),
    ]),
    detailNote("设置保存在 Electron userData 目录，不会写入 Codex 会话文件。"));
}

function settingsGroup(title, rows) {
  const group = document.createElement("section");
  group.className = "settings-group";
  const heading = textNode("div", title);
  heading.className = "settings-heading";
  group.append(heading, ...rows);
  return group;
}

function settingRow(title, subtitle, control, options = {}) {
  const row = document.createElement("div");
  row.className = "setting-row";
  if (options.disabled) row.classList.add("is-disabled");

  const copy = document.createElement("div");
  copy.className = "setting-copy";
  const titleNode = textNode("strong", title);
  const subtitleNode = textNode("small", subtitle);
  copy.append(titleNode, subtitleNode);

  row.append(copy, control);
  return row;
}

function toggleControl(checked, onChange, settingName = "") {
  const label = document.createElement("label");
  label.className = "toggle-switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  if (settingName) input.dataset.setting = settingName;
  input.addEventListener("change", () => onChange(input.checked));
  const slider = document.createElement("span");
  slider.className = "toggle-slider";
  label.append(input, slider);
  return label;
}

function statusPill(text) {
  const pill = textNode("span", text);
  pill.className = "status-pill";
  return pill;
}

function actionButton(text, onClick) {
  const button = textNode("button", text);
  button.className = "action-button";
  button.type = "button";
  button.addEventListener("click", async () => {
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "处理中";
    try {
      await onClick();
    } catch (error) {
      renderErrors([{ area: "action", message: error.message }]);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  });
  return button;
}

function resetSummary(reset, snapshot) {
  const summary = document.createElement("section");
  summary.className = "reset-summary";

  const count = document.createElement("div");
  count.className = "reset-summary-count";
  count.append(textNode("strong", String(reset.availableCount)), textNode("span", `/ ${reset.totalCount} 可用`));

  const facts = document.createElement("div");
  facts.className = "reset-summary-facts";
  facts.append(
    summaryFact("下次到期", reset.nextExpiresAt ? fullDate(reset.nextExpiresAt) : "--"),
    summaryFact("剩余", reset.secondsUntilNextExpiry == null ? "--" : compactDuration(reset.secondsUntilNextExpiry)),
    summaryFact("更新", reset.updatedAt ? relativeTime(reset.updatedAt) : relativeTime(snapshot.generatedAt)));

  summary.append(count, facts);
  return summary;
}

function summaryFact(label, value) {
  const row = document.createElement("div");
  row.className = "summary-fact";
  row.append(textNode("span", label), textNode("strong", value || "--"));
  return row;
}

function metricGrid(items) {
  const grid = document.createElement("div");
  grid.className = "metric-grid";
  for (const [label, value] of items) {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.append(textNode("small", label), textNode("strong", String(value)));
    grid.append(card);
  }
  return grid;
}

function detailTable(rows) {
  const table = document.createElement("div");
  table.className = "detail-table";
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "detail-row";
    row.append(textNode("span", label), textNode("span", value || "--"));
    table.append(row);
  }
  return table;
}

function detailNote(text) {
  const note = document.createElement("div");
  note.className = "detail-note";
  note.textContent = text;
  return note;
}

function quotaWindows(quota) {
  return [
    quota?.primary ? { label: "5 小时", window: quota.primary } : null,
    quota?.secondary ? { label: "每周", window: quota.secondary } : null,
    ...((quota?.additional || []).map((item) => ({ label: item.name, window: item.window }))),
  ].filter(Boolean);
}

function quotaWindowList(windows) {
  const list = document.createElement("div");
  list.className = "quota-window-list";
  for (const { label, window } of windows) {
    const remaining = clampPercent(window.remainingPercent);
    const card = document.createElement("article");
    card.className = "quota-window-card";

    const header = document.createElement("div");
    header.className = "quota-window-header";
    header.append(textNode("strong", label), textNode("span", `${remaining}% 剩余`));

    const track = document.createElement("div");
    track.className = "progress-track";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.setProperty("--value", `${remaining}%`);
    track.append(fill);

    const facts = document.createElement("div");
    facts.className = "quota-window-facts";
    facts.append(
      summaryFact("已用", `${100 - remaining}%`),
      summaryFact("相对重置", window.secondsUntilReset == null ? "--" : compactDuration(window.secondsUntilReset)),
      summaryFact("精确重置", window.resetsAt ? exactDate(window.resetsAt) : "--"));

    card.append(header, track, facts);
    list.append(card);
  }
  return list;
}

function recentSummary(snapshot, sessions) {
  const totalTokens = sessions.reduce((sum, item) => sum + (Number(item.totalTokens) || 0), 0);
  const totalCost = sessions.reduce((sum, item) => sum + (Number(item.estimatedUSD) || 0), 0);
  const summary = snapshot.sessions || {};
  return metricGrid([
    ["详情条数", String(sessions.length)],
    ["列表 Tokens", formatTokens(totalTokens)],
    ["列表成本", formatMoney(totalCost)],
    ["缺失/孤立", `${summary.missingCount ?? "--"} / ${summary.orphanCount ?? "--"}`],
  ]);
}

function sessionDetailRow(item) {
  const row = document.createElement("article");
  row.className = "session-detail-row";

  const main = document.createElement("div");
  main.className = "session-detail-main";
  const title = textNode("strong", item.title || item.projectName || "Untitled");
  const metaGrid = document.createElement("div");
  metaGrid.className = "session-detail-meta-grid";
  metaGrid.append(
    detailChip("项目", item.projectName || "local"),
    detailChip("更新时间", exactDate(item.updatedAt)),
    detailChip("Tokens", `${formatTokens(item.totalTokens)} (${Number(item.totalTokens || 0).toLocaleString("en-US")})`),
    detailChip("ID", item.id || "--"));
  main.append(title, metaGrid);

  const side = document.createElement("div");
  side.className = "session-detail-side";
  side.append(textNode("strong", formatMoney(item.estimatedUSD)), textNode("small", stateLabel(item.state)));

  row.append(main, side);
  return row;
}

function apiExplainer(api) {
  const box = document.createElement("div");
  box.className = "api-explainer";
  const rows = [
    ["统计范围", `${exactDate(api.windowStart)} 至 ${exactDate(api.windowEnd)}`],
    ["扫描来源", sourceLabel(api.source)],
    ["估算方式", `${confidenceLabel(api.confidence)} · 未知模型会回退到等价成本`],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "api-explainer-row";
    row.append(textNode("span", label), textNode("strong", value));
    box.append(row);
  }
  return box;
}

function detailChip(label, value) {
  const chip = document.createElement("div");
  chip.className = "detail-chip";
  chip.append(textNode("span", label), textNode("strong", value || "--"));
  return chip;
}

function resetCreditList(credits) {
  const list = document.createElement("div");
  list.className = "reset-credit-list";
  if (!credits.length) {
    list.append(emptyState("没有单条 reset credit 明细"));
    return list;
  }
  for (const [index, credit] of credits.entries()) {
    const row = document.createElement("article");
    row.className = "reset-credit-row";

    const main = document.createElement("div");
    main.className = "reset-credit-main";
    const title = textNode("div", `次数 ${index + 1}`);
    title.className = "reset-credit-title";
    const id = credit.id ? ` · ${shortId(credit.id)}` : "";
    const expires = credit.expiresAt ? fullDate(credit.expiresAt) : "无到期时间";
    const meta = textNode("div", `${expires}${id}`);
    meta.className = "reset-credit-meta";
    const extra = document.createElement("div");
    extra.className = "reset-credit-extra";
    extra.append(
      textNode("span", `创建 ${credit.createdAt ? exactDate(credit.createdAt) : "--"}`),
      textNode("span", `到期 ${credit.expiresAt ? exactDate(credit.expiresAt) : "--"}`),
      textNode("span", `ID ${credit.id || "--"}`));
    main.append(title, meta, extra);

    const side = document.createElement("div");
    side.className = "reset-credit-side";
    const badge = textNode("span", riskLabel(credit.risk, credit.status));
    badge.className = `risk-badge risk-${credit.risk || "unknown"}`;
    const remaining = textNode("small", credit.remainingSeconds == null ? "--" : compactDuration(credit.remainingSeconds));
    side.append(remaining, badge);

    row.append(main, side);
    list.append(row);
  }
  return list;
}

function emptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = text;
  return empty;
}

function textNode(tagName, text) {
  const node = document.createElement(tagName);
  node.textContent = text;
  return node;
}

function planLabel(plan) {
  if (!plan) return "--";
  if (plan.toLowerCase() === "plus") return "Plus";
  if (plan.toLowerCase().includes("pro")) return "Pro";
  return plan;
}

function accountLabel(accountId, tokenState) {
  if (!accountId) return tokenState === "loading" ? "正在刷新状态" : "未读取到 Codex 账号";
  return `${accountId.slice(0, 8)}…${accountId.slice(-4)}`;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function resetLabel(seconds) {
  if (seconds == null) return "重置时间未知";
  return `下次重置于 ${compactDuration(seconds)}`;
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

function formatMoney(value) {
  if (value == null) return "$--";
  return `$${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

function formatTokens(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return `${Math.round(number)}`;
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "刚刚";
  if (abs < 3600) return `${Math.round(abs / 60)}分钟前`;
  if (abs < 86400) return `${Math.round(abs / 3600)}小时前`;
  return `${Math.round(abs / 86400)}天前`;
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function fullDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exactDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const pad = (number) => String(number).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(" ");
}

function shortId(value) {
  if (!value || value.length <= 10) return value || "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function sourceLabel(value) {
  if (value === "localSessions") return "本地会话";
  if (value === "remoteUsage") return "远端用量";
  if (value === "cache") return "本地缓存";
  return value || "--";
}

function confidenceLabel(value) {
  if (value === "exact") return "精确";
  if (value === "estimated") return "估算";
  if (value === "partial") return "部分估算";
  return value || "--";
}

function stateLabel(value) {
  if (value === "recent") return "最近";
  if (value === "missing") return "缺失";
  if (value === "orphan") return "孤立";
  if (value === "archived") return "归档";
  return value || "--";
}

function platformLabel(value) {
  if (value === "win32") return "Windows";
  if (value === "darwin") return "macOS";
  if (value === "linux") return "Linux";
  return value || "--";
}

function modeLabel(value) {
  if (value === "packaged") return "便携包";
  if (value === "preview") return "预览";
  if (value === "development") return "开发";
  return value || "--";
}

function riskLabel(risk, status) {
  if (status && status !== "available") return status;
  if (risk === "expiring") return "即将到期";
  if (risk === "available") return "可用";
  if (risk === "unavailable") return "不可用";
  return status || "--";
}

elements.refreshButton.addEventListener("click", () => {
  elements.refreshButton.classList.add("loading");
  window.runway.refresh();
});
elements.openFolderButton.addEventListener("click", () => window.runway.openCodexFolder());
elements.closeButton.addEventListener("click", () => window.runway.closePanel());
elements.closePanelButton.addEventListener("click", () => window.runway.closePanel());
elements.settingsButton.addEventListener("click", toggleSettings);
elements.backButton.addEventListener("click", showHome);
elements.resetCard.addEventListener("click", showResetDetail);
elements.apiCard.addEventListener("click", showApiDetail);

window.runway.onStatusUpdated(render);
window.runway.getStatus().then((payload) => {
  updateViewControls();
  render(payload);
});

const colorSchemeQuery = window.matchMedia?.("(prefers-color-scheme: light)");
colorSchemeQuery?.addEventListener("change", applyAppearance);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.runway.closePanel();
});
