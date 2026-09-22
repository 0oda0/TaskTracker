// Period-key helpers: turn a date into a key identifying "which occurrence"
// of a recurring task it belongs to, so completions can be tracked per period.

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ISO-8601 week number (weeks start Monday, week 1 contains the year's first Thursday).
function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(weekNo)}`;
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// 'once' tasks have exactly one occurrence ever - a fixed period key works
// uniformly with the completions table instead of needing a special case.
function periodKey(periodType, d = new Date()) {
  if (periodType === "daily") return dateKey(d);
  if (periodType === "weekly") return isoWeekKey(d);
  if (periodType === "monthly") return monthKey(d);
  return "once";
}

// Step one period back, for walking history/streaks. Built from
// year/month/day components (not raw ms subtraction) so month length and
// year rollover normalize the way JS Date already guarantees.
function previousPeriod(periodType, d = new Date()) {
  if (periodType === "weekly") return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
  if (periodType === "monthly") return new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); // daily & once
}

module.exports = { dateKey, isoWeekKey, monthKey, periodKey, previousPeriod };
