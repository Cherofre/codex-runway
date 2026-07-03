const https = require("node:https");

const latestReleaseUrl = "https://api.github.com/repos/Licoy/codex-runway/releases/latest";
const releasesUrl = "https://github.com/Licoy/codex-runway/releases";

function normalizeVersion(value) {
  const text = String(value || "").trim().replace(/^v/i, "");
  return text.split(".").map((part) => {
    const number = Number.parseInt(part.replace(/[^\d].*$/, ""), 10);
    return Number.isFinite(number) ? number : 0;
  }).concat([0, 0, 0]).slice(0, 3);
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

async function checkForUpdates({
  currentVersion,
  requestJson = requestLatestRelease,
} = {}) {
  try {
    const release = await requestJson(latestReleaseUrl);
    const latestVersion = release.tag_name || release.name || "";
    if (!latestVersion) return unavailableResult("发布信息里没有版本号");

    const url = release.html_url || releasesUrl;
    if (compareVersions(latestVersion, currentVersion) > 0) {
      return {
        status: "newer",
        latestVersion,
        url,
        summary: `发现新版本 ${latestVersion}`,
        detail: [
          `当前版本：${currentVersion || "--"}`,
          `最新版本：${latestVersion}`,
          `发布页面：${url}`,
        ].join("\n"),
      };
    }

    return {
      status: "current",
      latestVersion,
      url,
      summary: "当前已是最新版本",
      detail: `当前版本：${currentVersion || "--"}\n最新版本：${latestVersion}`,
    };
  } catch (error) {
    if (error.statusCode === 404) return unavailableResult("GitHub 暂无 release");
    return {
      status: "error",
      summary: "检查更新失败",
      detail: error.message,
    };
  }
}

function unavailableResult(detail) {
  return {
    status: "unavailable",
    summary: "暂未发现可用发布版本",
    detail,
    url: releasesUrl,
  };
}

function requestLatestRelease(url = latestReleaseUrl) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "codex-runway-windows-tray",
      },
    }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { data += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`GitHub API returned ${response.statusCode}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(15_000, () => {
      request.destroy(new Error("检查更新超时"));
    });
    request.on("error", reject);
  });
}

module.exports = {
  checkForUpdates,
  compareVersions,
  latestReleaseUrl,
  normalizeVersion,
  releasesUrl,
  requestLatestRelease,
};
