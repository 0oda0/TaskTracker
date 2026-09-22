const test = require("node:test");
const assert = require("node:assert/strict");
const { dateKey, isoWeekKey, monthKey, periodKey, previousPeriod } = require("../src/period");

test("dateKey formats as YYYY-MM-DD", () => {
  assert.equal(dateKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(dateKey(new Date(2026, 8, 22)), "2026-09-22");
});

test("isoWeekKey matches known ISO-8601 week numbers", () => {
  assert.equal(isoWeekKey(new Date(Date.UTC(2024, 0, 1))), "2024-W01"); // Mon
  assert.equal(isoWeekKey(new Date(Date.UTC(2023, 0, 1))), "2022-W52"); // Sun -> prior year's last week
  assert.equal(isoWeekKey(new Date(Date.UTC(2020, 11, 31))), "2020-W53"); // Thu, 53-week year
});

test("monthKey formats as YYYY-MM", () => {
  assert.equal(monthKey(new Date(2026, 8, 22)), "2026-09");
});

test("periodKey delegates by type, 'once' is a fixed single period", () => {
  const d = new Date(2026, 8, 22);
  assert.equal(periodKey("daily", d), dateKey(d));
  assert.equal(periodKey("weekly", d), isoWeekKey(d));
  assert.equal(periodKey("monthly", d), monthKey(d));
  assert.equal(periodKey("once", d), "once");
});

test("previousPeriod steps back one occurrence per type", () => {
  assert.equal(dateKey(previousPeriod("daily", new Date(2026, 8, 1))), "2026-08-31"); // crosses month boundary
  assert.equal(dateKey(previousPeriod("weekly", new Date(2026, 8, 22))), "2026-09-15");
  assert.equal(monthKey(previousPeriod("monthly", new Date(2026, 0, 15))), "2025-12"); // crosses year boundary
  assert.equal(monthKey(previousPeriod("monthly", new Date(2026, 2, 31))), "2026-02"); // no day-31-in-Feb overflow bug
});
