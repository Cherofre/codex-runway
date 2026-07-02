const assert = require("node:assert/strict");
const { test } = require("node:test");

const { fetchSnapshotWithRetry } = require("../refresh");

test("fetchSnapshotWithRetry retries snapshots with timeout errors", async () => {
  let attempts = 0;
  const snapshots = [
    {
      schemaVersion: 1,
      generatedAt: "2026-07-02T00:00:00Z",
      errors: [{
        area: "quota",
        message: "The operation could not be completed. (NSURLErrorDomain error -1001.)",
      }],
    },
    {
      schemaVersion: 1,
      generatedAt: "2026-07-02T00:00:01Z",
      errors: [],
      quota: { primary: { remainingPercent: 81 } },
    },
  ];

  const snapshot = await fetchSnapshotWithRetry({
    runOnce: async () => snapshots[attempts++],
    delay: async () => {},
    maxAttempts: 2,
  });

  assert.equal(attempts, 2);
  assert.equal(snapshot.errors.length, 0);
  assert.equal(snapshot.quota.primary.remainingPercent, 81);
});

test("fetchSnapshotWithRetry does not retry non-retryable errors", async () => {
  let attempts = 0;
  const snapshot = await fetchSnapshotWithRetry({
    runOnce: async () => {
      attempts += 1;
      return {
        schemaVersion: 1,
        generatedAt: "2026-07-02T00:00:00Z",
        errors: [{ area: "auth", message: "missing token" }],
      };
    },
    delay: async () => {},
    maxAttempts: 2,
  });

  assert.equal(attempts, 1);
  assert.equal(snapshot.errors[0].area, "auth");
});
