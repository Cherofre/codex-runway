const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  formatErrorLine,
  friendlyErrorMessage,
  isRetryableError,
} = require("../errorText");

test("friendlyErrorMessage hides raw NSURLError timeout text", () => {
  const message = friendlyErrorMessage("The operation could not be completed. (NSURLErrorDomain error -1001.)");

  assert.equal(message, "请求超时，请稍后刷新");
  assert.equal(message.includes("NSURLErrorDomain"), false);
});

test("formatErrorLine localizes known areas", () => {
  assert.equal(formatErrorLine({
    area: "quota",
    message: "The operation could not be completed. (NSURLErrorDomain error -1001.)",
  }), "配额：请求超时，请稍后刷新");
});

test("formatErrorLine prefers structured CLI error codes", () => {
  assert.equal(formatErrorLine({
    area: "quota",
    code: "timeout",
    message: "请求超时，请稍后刷新",
    rawMessage: "The operation could not be completed. (NSURLErrorDomain error -1001.)",
    isRetryable: true,
  }), "配额：请求超时，请稍后刷新");
});

test("isRetryableError detects timeout and network-loss failures", () => {
  assert.equal(isRetryableError({
    area: "quota",
    message: "The operation could not be completed. (NSURLErrorDomain error -1001.)",
  }), true);
  assert.equal(isRetryableError({
    area: "quota",
    code: "timeout",
    message: "请求超时，请稍后刷新",
    isRetryable: true,
  }), true);
  assert.equal(isRetryableError({
    area: "auth",
    message: "missing token",
  }), false);
});
