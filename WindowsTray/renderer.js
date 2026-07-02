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
const defaultSettings = {
  refreshIntervalMinutes: 5,
  showQuotaMeters: true,
  showResetCredits: true,
  showApiEquivalent: true,
  showRecentSessions: true,
};

let latestPayload = null;
let currentView = "home";
let settings = { ...defaultSettings };

function render(payload) {
  latestPayload = payload;
  settings = normalizeSettings(payload?.settings || settings);
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
  const item = document.createElement("div");
  item.className = "quota-item";

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
  const row = document.createElement("article");
  row.className = "session-item";

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
  };
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
  applySettingsVisibility();
  if (currentView === "settings") renderSettingsDetail();
  try {
    settings = normalizeSettings(await window.runway.updateSettings(patch));
    applySettingsVisibility();
    if (currentView === "settings") renderSettingsDetail();
  } catch (error) {
    renderErrors([{ area: "settings.save", message: error.message }]);
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
  elements.detailSubtitle.textContent = api ? `${api.source} · ${api.confidence}` : "数据暂不可用";
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
      ["来源", api.source || "--"],
    ]),
    detailTable([
      ["置信度", api.confidence || "--"],
      ["窗口开始", fullDate(api.windowStart)],
      ["窗口结束", fullDate(api.windowEnd)],
      ["计算时间", fullDate(api.calculatedAt)],
    ]),
    detailNote("这里按本机会话 JSONL 统计 API 等价成本，不上传会话内容。"));
}

function renderSettingsDetail() {
  elements.detailTitle.textContent = "设置";
  elements.detailSubtitle.textContent = "Windows 托盘 · 本机保存";
  elements.detailContent.replaceChildren();

  const refreshSelect = document.createElement("select");
  refreshSelect.className = "select-control";
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
    settingsGroup("刷新", [
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
      settingRow("开机启动", "需要打包安装后接入", statusPill("未移植"), { disabled: true }),
      settingRow("通知提醒", "额度提醒和重置提醒", statusPill("未移植"), { disabled: true }),
      settingRow("自动更新", "Windows 发布流程待补", statusPill("未移植"), { disabled: true }),
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

function toggleControl(checked, onChange) {
  const label = document.createElement("label");
  label.className = "toggle-switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
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
    main.append(title, meta);

    const side = document.createElement("div");
    side.className = "reset-credit-side";
    const badge = textNode("span", riskLabel(credit.risk, credit.status));
    badge.className = `risk-badge risk-${credit.risk || "unknown"}`;
    const remaining = textNode("small", credit.remainingSeconds == null ? "--" : compactDuration(credit.remainingSeconds));
    side.append(badge, remaining);

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

function shortId(value) {
  if (!value || value.length <= 10) return value || "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.runway.closePanel();
});
