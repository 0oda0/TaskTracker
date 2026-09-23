// In-memory login throttle - fine for a single-instance deployment like
// this one (no Redis/shared store needed). Keyed by caller so one bucket
// tracks "this IP hammering any account" and another tracks "this account
// being hammered from anywhere" - either one tripping blocks the attempt.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const buckets = new Map();

function prune(key) {
  const rec = buckets.get(key);
  if (rec && Date.now() - rec.first > WINDOW_MS) buckets.delete(key);
}

function isRateLimited(key) {
  prune(key);
  const rec = buckets.get(key);
  return !!rec && rec.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  prune(key);
  const rec = buckets.get(key);
  if (rec) rec.count++;
  else buckets.set(key, { count: 1, first: Date.now() });
}

function recordSuccess(key) {
  buckets.delete(key);
}

module.exports = { isRateLimited, recordFailure, recordSuccess };
