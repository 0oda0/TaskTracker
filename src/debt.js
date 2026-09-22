const db = require("./db");
const repo = require("./repo");
const { dateKey } = require("./period");
const { mostRecentSundayDeadline, weekDatesEndingSunday, weekKeyForSunday, computeShortfall, isQualifyingDay } = require("./debt-calc");

const SETTING_KEY = "last_debt_run_week";

// Checks the most recently closed Mon..Sun(18:01) accounting week for every
// daily quantity task ("5 приседаний каждый день"), and for anyone who fell
// short creates a one-off "debt" task for exactly the missing amount, plus a
// notification. Safe to call often (setInterval) and after downtime - it
// only ever processes a given ISO week once (see app_settings).
function checkWeeklyDebts(now = new Date()) {
  const sunday = mostRecentSundayDeadline(now);
  const weekKey = weekKeyForSunday(sunday);
  if (repo.getSetting(SETTING_KEY) === weekKey) return [];

  const days = weekDatesEndingSunday(sunday);
  const dailyQuantityTasks = db.prepare(
    "SELECT * FROM tasks WHERE period_type = 'daily' AND target_count IS NOT NULL AND status = 'active'"
  ).all();

  const created = [];
  for (const task of dailyQuantityTasks) {
    const qualifyingDays = days.filter((d) => isQualifyingDay(task.created_at, d));
    if (!qualifyingDays.length) continue;

    const actualTotal = qualifyingDays.reduce((sum, d) => sum + repo.periodAmount(task.id, dateKey(d)), 0);
    const shortfall = computeShortfall({
      targetPerDay: task.target_count,
      qualifyingDayCount: qualifyingDays.length,
      actualTotal,
    });
    if (shortfall <= 0) continue;

    const debtTaskId = repo.createTask({
      title: `Долг: ${task.title} (−${shortfall})`,
      description: `Не выполнено за неделю до ${dateKey(sunday)}: ${actualTotal} из ${qualifyingDays.length * task.target_count}.`,
      sphereId: task.sphere_id,
      createdBy: task.created_by,
      assigneeId: task.assignee_id,
      periodType: "once",
      dueDate: dateKey(sunday),
      weekday: null,
      monthDay: null,
      targetCount: shortfall,
    });
    repo.createNotification(
      task.assignee_id,
      `За неделю не хватило ${shortfall} (задача «${task.title}»). Создана задача-долг.`,
      debtTaskId
    );
    created.push(debtTaskId);
  }

  repo.setSetting(SETTING_KEY, weekKey);
  return created;
}

module.exports = { checkWeeklyDebts };
