const test = require("node:test");
const assert = require("node:assert/strict");
const { isRateLimited, recordFailure, recordSuccess } = require("../src/rate-limit");

test("blocks after 8 failures, not before", () => {
  const key = "test:threshold:" + Math.random();
  for (let i = 0; i < 7; i++) {
    recordFailure(key);
    assert.equal(isRateLimited(key), false, `should not be limited after ${i + 1} failures`);
  }
  recordFailure(key); // 8th
  assert.equal(isRateLimited(key), true);
});

test("recordSuccess clears the bucket", () => {
  const key = "test:success:" + Math.random();
  for (let i = 0; i < 8; i++) recordFailure(key);
  assert.equal(isRateLimited(key), true);
  recordSuccess(key);
  assert.equal(isRateLimited(key), false);
});

test("unrelated keys don't affect each other", () => {
  const a = "test:a:" + Math.random();
  const b = "test:b:" + Math.random();
  for (let i = 0; i < 8; i++) recordFailure(a);
  assert.equal(isRateLimited(a), true);
  assert.equal(isRateLimited(b), false);
});
