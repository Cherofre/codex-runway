const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  buildAlertCandidates,
  nextUnseenAlerts,
  normalizeAlertState,
  rememberDeliveredAlerts,
} = require("../alerts");

test("buildAlertCandidates emits the highest quota threshold for each active window", () => {
  const alerts = buildAlertCandidates({
    quota: {
      primary: {
        remainingPercent: 4,
        resetsAt: "2026-07-02T16:00:00Z",
      },
      secondary: {
        remainingPercent: 20,
        resetsAt: "2026-07-06T00:00:00Z",
      },
      additional: [{
        name: "GPT-5.3-Codex-Spark",
        window: {
          remainingPercent: 0,
          resetsAt: "2026-07-02T18:00:00Z",
        },
      }],
    },
  });

  assert.deepEqual(alerts.map((alert) => alert.id), [
    "quota:5h:95:2026-07-02T16:00:00Z",
    "quota:weekly:80:2026-07-06T00:00:00Z",
    "quota:GPT-5.3-Codex-Spark:100:2026-07-02T18:00:00Z",
  ]);
  assert.equal(alerts[0].title, "Codex 配额提醒");
  assert.equal(alerts[0].body, "5 小时用量已达到 95%");
});

test("buildAlertCandidates emits one reset credit expiry alert for the earliest risky credit", () => {
  const alerts = buildAlertCandidates({
    resetCredits: {
      credits: [
        {
          id: "ratelimit_reset_later",
          status: "available",
          risk: "expiring",
          expiresAt: "2026-07-05T00:00:00Z",
          remainingSeconds: 259200,
        },
        {
          id: "ratelimit_reset_soon",
          status: "available",
          risk: "available",
          expiresAt: "2026-07-03T12:00:00Z",
          remainingSeconds: 43200,
        },
        {
          id: "ratelimit_reset_used",
          status: "used",
          risk: "expiring",
          expiresAt: "2026-07-03T00:00:00Z",
          remainingSeconds: 1200,
        },
      ],
    },
  });

  assert.deepEqual(alerts.map((alert) => alert.id), [
    "reset-credit:ratelimit_reset_soon:2026-07-03T12:00:00Z",
  ]);
  assert.equal(alerts[0].title, "重置次数即将到期");
  assert.match(alerts[0].body, /将在 12小时 后到期/);
});

test("nextUnseenAlerts and rememberDeliveredAlerts persist notification de-duplication", () => {
  const candidates = [
    { id: "quota:5h:80:reset-a", title: "A", body: "A" },
    { id: "quota:weekly:80:reset-b", title: "B", body: "B" },
  ];
  const state = normalizeAlertState({ seenIds: ["quota:5h:80:reset-a", 7, ""] });

  assert.deepEqual(nextUnseenAlerts(candidates, state).map((alert) => alert.id), [
    "quota:weekly:80:reset-b",
  ]);

  assert.deepEqual(rememberDeliveredAlerts(state, candidates), {
    seenIds: ["quota:5h:80:reset-a", "quota:weekly:80:reset-b"],
  });
});
