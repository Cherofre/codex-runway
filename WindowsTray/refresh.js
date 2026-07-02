const { isRetryableError, snapshotHasRetryableError } = require("./errorText");

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchSnapshotWithRetry({
  runOnce,
  delay = sleep,
  maxAttempts = 2,
  retryDelayMs = 1_200,
} = {}) {
  if (typeof runOnce !== "function") {
    throw new TypeError("runOnce must be a function");
  }

  let lastSnapshot = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      lastSnapshot = await runOnce();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableError({ area: "tray.refresh", message: error.message })) {
        throw error;
      }
      await delay(retryDelayMs, attempt);
      continue;
    }

    if (attempt >= maxAttempts || !snapshotHasRetryableError(lastSnapshot)) {
      return lastSnapshot;
    }
    await delay(retryDelayMs, attempt);
  }
  return lastSnapshot;
}

module.exports = {
  fetchSnapshotWithRetry,
  sleep,
};
