const WEEKDAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function periodLabel(task) {
  if (task.period_type === "once") return `Разово, ${formatDate(task.due_date)}`;
  if (task.period_type === "daily") return "Каждый день";
  if (task.period_type === "weekly") {
    return task.weekday === null ? "Каждую неделю (любой день)" : `Каждую неделю, ${WEEKDAY_NAMES[task.weekday]}`;
  }
  if (task.period_type === "monthly") {
    return task.month_day === null ? "Каждый месяц (любой день)" : `Каждый месяц, ${task.month_day} числа`;
  }
  return task.period_type;
}

const SPHERE_PALETTE = ["violet", "teal", "amber", "rose", "sky", "lime"];

// Deterministic color per sphere id, so the same sphere always reads the
// same color across pages without storing a color column.
function sphereColor(sphereId) {
  return SPHERE_PALETTE[(sphereId - 1) % SPHERE_PALETTE.length];
}

function pct(amount, target) {
  if (!target) return 0;
  return Math.max(0, Math.min(100, Math.round((amount / target) * 100)));
}

module.exports = { formatDate, periodLabel, WEEKDAY_NAMES, sphereColor, pct };
