const db = require("./db");
const { periodKey, previousPeriod } = require("./period");

function listUsers() {
  return db.prepare("SELECT id, username, display_name FROM users ORDER BY display_name").all();
}

function getUserById(id) {
  return db.prepare("SELECT id, username, display_name FROM users WHERE id = ?").get(id);
}

function listSpheres() {
  return db.prepare("SELECT * FROM spheres ORDER BY id").all();
}

function getSphere(id) {
  return db.prepare("SELECT * FROM spheres WHERE id = ?").get(id);
}

const TASK_SELECT = `
  SELECT t.*, s.name AS sphere_name,
         a.display_name AS assignee_name, c.display_name AS creator_name
  FROM tasks t
  JOIN spheres s ON s.id = t.sphere_id
  JOIN users a ON a.id = t.assignee_id
  JOIN users c ON c.id = t.created_by
`;

function getTask(id) {
  return db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);
}

function listTasks({ assigneeId, sphereId, status } = {}) {
  const clauses = [];
  const params = [];
  if (assigneeId) {
    clauses.push("t.assignee_id = ?");
    params.push(assigneeId);
  }
  if (sphereId) {
    clauses.push("t.sphere_id = ?");
    params.push(sphereId);
  }
  if (status) {
    clauses.push("t.status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`${TASK_SELECT} ${where} ORDER BY t.created_at DESC`).all(...params);
}

function createTask({ title, description, sphereId, createdBy, assigneeId, periodType, dueDate, weekday, monthDay, targetCount }) {
  return db.prepare(`
    INSERT INTO tasks (title, description, sphere_id, created_by, assignee_id, period_type, due_date, weekday, month_day, target_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || null, sphereId, createdBy, assigneeId, periodType, dueDate || null, weekday, monthDay, targetCount || null).lastInsertRowid;
}

function updateTask(id, { title, description, sphereId, periodType, dueDate, weekday, monthDay, targetCount }) {
  db.prepare(`
    UPDATE tasks SET title = ?, description = ?, sphere_id = ?, period_type = ?, due_date = ?, weekday = ?, month_day = ?, target_count = ?
    WHERE id = ?
  `).run(title, description || null, sphereId, periodType, dueDate || null, weekday, monthDay, targetCount || null, id);
}

function deleteTask(id) {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

// A task with no target_count is a plain yes/no task - treat it as "target 1".
function effectiveTarget(task) {
  return task.target_count || 1;
}

// Does `now` fall within this task's active recurrence window (day-of-week / day-of-month constraint)?
function isDueNow(task, now = new Date()) {
  if (task.period_type === "once") return true;
  if (task.period_type === "weekly") return task.weekday === null || task.weekday === now.getDay();
  if (task.period_type === "monthly") return task.month_day === null || task.month_day === now.getDate();
  return true; // daily
}

function periodAmount(taskId, key) {
  const row = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM task_completions WHERE task_id = ? AND period_key = ?").get(taskId, key);
  return row.total;
}

function isCompletedForCurrentPeriod(task, now = new Date()) {
  return periodAmount(task.id, periodKey(task.period_type, now)) >= effectiveTarget(task);
}

// Logs `amount` toward the current period. Boolean tasks (no target_count)
// are idempotent - clicking "done" twice in the same period is a no-op.
function completeTask(task, userId, amount = 1, now = new Date()) {
  if (!task.target_count && isCompletedForCurrentPeriod(task, now)) return;
  const key = periodKey(task.period_type, now);
  db.prepare("INSERT INTO task_completions (task_id, user_id, period_key, amount) VALUES (?, ?, ?, ?)").run(task.id, userId, key, amount);
}

function lifetimeTotal(taskId) {
  const row = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM task_completions WHERE task_id = ?").get(taskId);
  return row.total;
}

// Consecutive satisfied periods, most recent first. The current in-progress
// period doesn't break a streak just because it isn't done yet - it only
// extends it once it is.
function currentStreak(task, now = new Date()) {
  let cursor = now;
  let streak = 0;
  if (periodAmount(task.id, periodKey(task.period_type, cursor)) >= effectiveTarget(task)) {
    streak = 1;
  }
  cursor = previousPeriod(task.period_type, cursor);
  while (periodAmount(task.id, periodKey(task.period_type, cursor)) >= effectiveTarget(task)) {
    streak++;
    cursor = previousPeriod(task.period_type, cursor);
  }
  return streak;
}

// Last `count` periods (most recent last), each with its amount and whether
// it met the target - powers the small history-dots row in the UI.
function historyForTask(task, now = new Date(), count = 14) {
  const out = [];
  let cursor = now;
  for (let i = 0; i < count; i++) {
    const key = periodKey(task.period_type, cursor);
    const amount = periodAmount(task.id, key);
    out.unshift({ key, amount, done: amount >= effectiveTarget(task) });
    cursor = previousPeriod(task.period_type, cursor);
  }
  return out;
}

// --- transfers ("perenimat s soglasiya") ---

function createTransfer({ taskId, direction, fromUserId, toUserId }) {
  return db.prepare(`
    INSERT INTO task_transfers (task_id, direction, from_user_id, to_user_id)
    VALUES (?, ?, ?, ?)
  `).run(taskId, direction, fromUserId, toUserId).lastInsertRowid;
}

function getTransfer(id) {
  return db.prepare(`
    SELECT tr.*, t.title AS task_title,
           f.display_name AS from_name, u.display_name AS to_name
    FROM task_transfers tr
    JOIN tasks t ON t.id = tr.task_id
    JOIN users f ON f.id = tr.from_user_id
    JOIN users u ON u.id = tr.to_user_id
    WHERE tr.id = ?
  `).get(id);
}

function listIncomingTransfers(userId) {
  return db.prepare(`
    SELECT tr.*, t.title AS task_title, f.display_name AS from_name
    FROM task_transfers tr
    JOIN tasks t ON t.id = tr.task_id
    JOIN users f ON f.id = tr.from_user_id
    WHERE tr.to_user_id = ? AND tr.status = 'pending'
    ORDER BY tr.created_at DESC
  `).all(userId);
}

function listOutgoingTransfers(userId) {
  return db.prepare(`
    SELECT tr.*, t.title AS task_title, u.display_name AS to_name
    FROM task_transfers tr
    JOIN tasks t ON t.id = tr.task_id
    JOIN users u ON u.id = tr.to_user_id
    WHERE tr.from_user_id = ? AND tr.status = 'pending'
    ORDER BY tr.created_at DESC
  `).all(userId);
}

function resolveTransfer(id, accept) {
  const tr = getTransfer(id);
  if (!tr || tr.status !== "pending") return null;
  if (accept) {
    const newAssignee = tr.direction === "offer" ? tr.to_user_id : tr.from_user_id;
    db.prepare("UPDATE tasks SET assignee_id = ? WHERE id = ?").run(newAssignee, tr.task_id);
    db.prepare("UPDATE task_transfers SET status = 'accepted' WHERE id = ?").run(id);
    db.prepare("UPDATE task_transfers SET status = 'cancelled' WHERE task_id = ? AND id != ? AND status = 'pending'").run(tr.task_id, id);
  } else {
    db.prepare("UPDATE task_transfers SET status = 'declined' WHERE id = ?").run(id);
  }
  return tr;
}

function cancelTransfer(id) {
  db.prepare("UPDATE task_transfers SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id);
}

// --- shopping lists ---

function listShoppingLists(userId) {
  return db.prepare(`
    SELECT * FROM shopping_lists WHERE owner_id IS NULL OR owner_id = ? ORDER BY owner_id IS NOT NULL, created_at
  `).all(userId);
}

function getShoppingList(id) {
  return db.prepare("SELECT * FROM shopping_lists WHERE id = ?").get(id);
}

function createShoppingList(name, ownerId) {
  return db.prepare("INSERT INTO shopping_lists (name, owner_id) VALUES (?, ?)").run(name, ownerId).lastInsertRowid;
}

function listShoppingItems(listId) {
  return db.prepare(`
    SELECT si.*, u.display_name AS added_by_name
    FROM shopping_items si
    JOIN users u ON u.id = si.added_by
    WHERE si.list_id = ?
    ORDER BY si.is_bought, si.created_at DESC
  `).all(listId);
}

function addShoppingItem(listId, name, userId) {
  db.prepare("INSERT INTO shopping_items (list_id, name, added_by) VALUES (?, ?, ?)").run(listId, name, userId);
}

function toggleShoppingItem(id) {
  db.prepare("UPDATE shopping_items SET is_bought = 1 - is_bought WHERE id = ?").run(id);
}

function deleteShoppingItem(id) {
  db.prepare("DELETE FROM shopping_items WHERE id = ?").run(id);
}

// --- progress: per-task tiles grouped by sphere ---

function progressBySphere(userId, now = new Date()) {
  const spheres = listSpheres();
  return spheres.map((sphere) => {
    const tasks = listTasks({ assigneeId: userId, sphereId: sphere.id, status: "active" }).map((t) => ({
      task: t,
      target: effectiveTarget(t),
      amount: periodAmount(t.id, periodKey(t.period_type, now)),
      done: isCompletedForCurrentPeriod(t, now),
      streak: currentStreak(t, now),
      history: historyForTask(t, now, t.period_type === "monthly" ? 6 : t.period_type === "weekly" ? 8 : 14),
    }));
    return { sphere, tasks };
  }).filter((g) => g.tasks.length > 0);
}

// --- notifications ---

function createNotification(userId, message, taskId = null) {
  db.prepare("INSERT INTO notifications (user_id, message, task_id) VALUES (?, ?, ?)").run(userId, message, taskId);
}

function unreadNotificationCount(userId) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(userId);
  return row.n;
}

function listNotifications(userId, limit = 30) {
  return db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit);
}

function markAllNotificationsRead(userId) {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(userId);
}

// --- settings (key/value) ---

function getSetting(key) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

module.exports = {
  listUsers, getUserById,
  listSpheres, getSphere,
  getTask, listTasks, createTask, updateTask, deleteTask,
  effectiveTarget, isDueNow, periodAmount, isCompletedForCurrentPeriod, completeTask, lifetimeTotal, currentStreak, historyForTask,
  createTransfer, getTransfer, listIncomingTransfers, listOutgoingTransfers, resolveTransfer, cancelTransfer,
  listShoppingLists, getShoppingList, createShoppingList, listShoppingItems, addShoppingItem, toggleShoppingItem, deleteShoppingItem,
  progressBySphere,
  createNotification, unreadNotificationCount, listNotifications, markAllNotificationsRead,
  getSetting, setSetting,
};
