const test = require("node:test");
const assert = require("node:assert/strict");
const { dateKey } = require("../src/period");
const {
  mostRecentSundayDeadline, weekDatesEndingSunday, weekKeyForSunday,
  computeShortfall, isQualifyingDay,
} = require("../src/debt-calc");

test("mostRecentSundayDeadline: Sunday before 18:01 -> falls back to last week", () => {
  const sat = new Date(2026, 8, 20, 17, 0); // Sunday 2026-09-20 at 17:00
  const d = mostRecentSundayDeadline(sat);
  assert.equal(dateKey(d), "2026-09-13");
});

test("mostRecentSundayDeadline: Sunday at/after 18:01 -> that same Sunday", () => {
  const sun = new Date(2026, 8, 20, 18, 5); // 2026-09-20 is a Sunday
  const d = mostRecentSundayDeadline(sun);
  assert.equal(dateKey(d), "2026-09-20");
});

test("mostRecentSundayDeadline: mid-week -> most recent past Sunday", () => {
  const wed = new Date(2026, 8, 23, 12, 0); // Wednesday
  const d = mostRecentSundayDeadline(wed);
  assert.equal(dateKey(d), "2026-09-20");
});

test("weekDatesEndingSunday returns Monday..Sunday of that ISO week", () => {
  const sunday = new Date(2026, 8, 20, 18, 1);
  const days = weekDatesEndingSunday(sunday).map(dateKey);
  assert.deepEqual(days, [
    "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17",
    "2026-09-18", "2026-09-19", "2026-09-20",
  ]);
});

test("weekKeyForSunday matches the Monday's ISO week", () => {
  assert.equal(weekKeyForSunday(new Date(2026, 8, 20)), "2026-W38");
});

test("computeShortfall clamps at 0 (no negative debt for over-achieving)", () => {
  assert.equal(computeShortfall({ targetPerDay: 5, qualifyingDayCount: 7, actualTotal: 20 }), 15);
  assert.equal(computeShortfall({ targetPerDay: 5, qualifyingDayCount: 7, actualTotal: 35 }), 0);
  assert.equal(computeShortfall({ targetPerDay: 5, qualifyingDayCount: 7, actualTotal: 50 }), 0);
});

test("isQualifyingDay excludes days before the task existed", () => {
  const createdAt = "2026-09-17 08:00:00"; // Thursday, UTC
  assert.equal(isQualifyingDay(createdAt, new Date(2026, 8, 16)), false); // Wed, before
  assert.equal(isQualifyingDay(createdAt, new Date(2026, 8, 17)), true); // same day
  assert.equal(isQualifyingDay(createdAt, new Date(2026, 8, 20)), true); // after
});
