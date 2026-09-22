// Pure date/math for the weekly "debt" check: a daily quantity task
// (e.g. "5 приседаний" every day) is accounted Monday..Sunday, with the
// week closing at Sunday 18:01 local time. Kept dependency-free from the DB
// so the date arithmetic can be unit-tested directly.
const { dateKey, isoWeekKey } = require("./period");

const DEADLINE_HOUR = 18;
const DEADLINE_MINUTE = 1;

// The most recent Sunday-18:01 instant that is <= now (could be "just now"
// if today is Sunday past the deadline, otherwise last week's).
function mostRecentSundayDeadline(now = new Date()) {
  const daysSinceSunday = now.getDay(); // 0 if today is Sunday
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceSunday, DEADLINE_HOUR, DEADLINE_MINUTE, 0);
  if (sunday > now) sunday.setDate(sunday.getDate() - 7);
  return sunday;
}

// The 7 calendar dates (Monday..Sunday) of the ISO week that `sunday` (a
// date produced by mostRecentSundayDeadline) belongs to.
function weekDatesEndingSunday(sunday) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - i));
  }
  return days;
}

function weekKeyForSunday(sunday) {
  return isoWeekKey(sunday);
}

// expected = targetPerDay for every qualifying day (task already existed
// that day); shortfall is clamped to >= 0 (over-achieving carries no credit
// into next week, keeping the rule simple).
function computeShortfall({ targetPerDay, qualifyingDayCount, actualTotal }) {
  const expected = targetPerDay * qualifyingDayCount;
  return Math.max(0, expected - actualTotal);
}

function isQualifyingDay(taskCreatedAtIso, day) {
  // taskCreatedAtIso is a sqlite UTC 'YYYY-MM-DD HH:MM:SS' timestamp; comparing
  // just the date portion is an approximation (off by <1 day around midnight
  // UTC vs local), acceptable for a weekly debt tally.
  return taskCreatedAtIso.slice(0, 10) <= dateKey(day);
}

module.exports = {
  DEADLINE_HOUR, DEADLINE_MINUTE,
  mostRecentSundayDeadline, weekDatesEndingSunday, weekKeyForSunday,
  computeShortfall, isQualifyingDay,
};
