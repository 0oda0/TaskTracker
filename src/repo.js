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

// --- friends ---

function findUserByUsername(username) {
  return db.prepare("SELECT id, username, display_name FROM users WHERE username = ?").get(username);
}

function getFriendship(userId, otherId) {
  return db.prepare(`
    SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(userId, otherId, otherId, userId);
}

function sendFriendRequest(fromUserId, username) {
  const target = findUserByUsername((username || "").trim());
  if (!target) return { error: "Пользователь не найден" };
  if (target.id === fromUserId) return { error: "Нельзя добавить самого себя" };

  const existing = getFriendship(fromUserId, target.id);
  if (existing) {
    if (existing.status === "accepted") return { error: "Уже в друзьях" };
    if (existing.status === "pending") return { error: "Запрос уже отправлен" };
    // was declined before - let them try again with a fresh request
    db.prepare("UPDATE friendships SET requester_id = ?, addressee_id = ?, status = 'pending', created_at = datetime('now') WHERE id = ?")
      .run(fromUserId, target.id, existing.id);
    return {};
  }
  db.prepare("INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)").run(fromUserId, target.id);
  return {};
}

function getFriendRequest(id) {
  return db.prepare(`
    SELECT f.*, r.display_name AS from_name, a.display_name AS to_name
    FROM friendships f
    JOIN users r ON r.id = f.requester_id
    JOIN users a ON a.id = f.addressee_id
    WHERE f.id = ?
  `).get(id);
}

function listIncomingFriendRequests(userId) {
  return db.prepare(`
    SELECT f.*, u.display_name AS from_name, u.username AS from_username
    FROM friendships f JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId);
}

function listOutgoingFriendRequests(userId) {
  return db.prepare(`
    SELECT f.*, u.display_name AS to_name, u.username AS to_username
    FROM friendships f JOIN users u ON u.id = f.addressee_id
    WHERE f.requester_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId);
}

function respondFriendRequest(id, userId, accept) {
  db.prepare("UPDATE friendships SET status = ? WHERE id = ? AND addressee_id = ? AND status = 'pending'")
    .run(accept ? "accepted" : "declined", id, userId);
}

function cancelFriendRequest(id, userId) {
  db.prepare("DELETE FROM friendships WHERE id = ? AND requester_id = ? AND status = 'pending'").run(id, userId);
}

function listFriends(userId) {
  return db.prepare(`
    SELECT u.id, u.username, u.display_name, fs.tag AS tag, COALESCE(fs.can_assign, 0) AS can_assign
    FROM friendships f
    JOIN users u ON u.id = (CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END)
    LEFT JOIN friend_settings fs ON fs.user_id = ? AND fs.friend_id = u.id
    WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
    ORDER BY u.display_name
  `).all(userId, userId, userId, userId);
}

function areFriends(userId, otherId) {
  if (userId === otherId) return true;
  const row = getFriendship(userId, otherId);
  return !!(row && row.status === "accepted");
}

// Everyone whose tasks/progress userId is allowed to see: self + accepted friends.
function visibleUserIds(userId) {
  return [userId, ...listFriends(userId).map((u) => u.id)];
}

function removeFriend(userId, otherId) {
  db.prepare(`
    DELETE FROM friendships WHERE status = 'accepted' AND
    ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
  `).run(userId, otherId, otherId, userId);
  db.prepare("DELETE FROM friend_settings WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")
    .run(userId, otherId, otherId, userId);
}

// userId's own tag/permission settings about friendId (tag shown to nobody
// else, can_assign controls whether friendId may create tasks for userId).
function upsertFriendSettings(userId, friendId, { tag, canAssign }) {
  if (!areFriends(userId, friendId)) return;
  db.prepare(`
    INSERT INTO friend_settings (user_id, friend_id, tag, can_assign) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, friend_id) DO UPDATE SET tag = excluded.tag, can_assign = excluded.can_assign
  `).run(userId, friendId, (tag || "").trim() || null, canAssign ? 1 : 0);
}

// Can assignerId create a task with targetId as assignee? Always true for
// yourself; for a friend, only once that friend has granted the permission
// (friend_settings row keyed by the friend's own perspective).
function canAssignTo(assignerId, targetId) {
  if (assignerId === targetId) return true;
  if (!areFriends(assignerId, targetId)) return false;
  const row = db.prepare("SELECT can_assign FROM friend_settings WHERE user_id = ? AND friend_id = ?").get(targetId, assignerId);
  return !!(row && row.can_assign);
}

// Self + every friend who has granted userId permission to assign them tasks.
function listAssignableUsers(userId) {
  const granters = db.prepare(`
    SELECT u.id, u.username, u.display_name
    FROM friend_settings fs
    JOIN users u ON u.id = fs.user_id
    JOIN friendships f ON f.status = 'accepted' AND
      ((f.requester_id = fs.user_id AND f.addressee_id = fs.friend_id) OR (f.requester_id = fs.friend_id AND f.addressee_id = fs.user_id))
    WHERE fs.friend_id = ? AND fs.can_assign = 1
  `).all(userId);
  return [getUserById(userId), ...granters];
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

function listTasks({ assigneeId, assigneeIds, sphereId, status } = {}) {
  const clauses = [];
  const params = [];
  if (assigneeId) {
    clauses.push("t.assignee_id = ?");
    params.push(assigneeId);
  }
  if (assigneeIds) {
    clauses.push(`t.assignee_id IN (${assigneeIds.map(() => "?").join(",")})`);
    params.push(...assigneeIds);
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

// Personal lists (owner_id set) only for their owner; shared lists (owner_id
// NULL) only for the creator's friend circle, not the whole server anymore.
function listShoppingLists(userId) {
  const visible = visibleUserIds(userId);
  return db.prepare(`
    SELECT * FROM shopping_lists
    WHERE owner_id = ? OR (owner_id IS NULL AND created_by IN (${visible.map(() => "?").join(",")}))
    ORDER BY owner_id IS NOT NULL, created_at
  `).all(userId, ...visible);
}

function getShoppingList(id) {
  return db.prepare("SELECT * FROM shopping_lists WHERE id = ?").get(id);
}

// isShared: visible to the creator's friends too, not just the creator.
function createShoppingList(name, createdBy, isShared) {
  return db.prepare("INSERT INTO shopping_lists (name, owner_id, created_by) VALUES (?, ?, ?)")
    .run(name, isShared ? null : createdBy, createdBy).lastInsertRowid;
}

// Can userId see/use this list at all (post items, toggle, etc.)?
function canAccessShoppingList(userId, list) {
  if (list.owner_id !== null) return list.owner_id === userId;
  return areFriends(userId, list.created_by);
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

function getShoppingItem(id) {
  return db.prepare("SELECT * FROM shopping_items WHERE id = ?").get(id);
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
  findUserByUsername, sendFriendRequest, getFriendRequest, listIncomingFriendRequests, listOutgoingFriendRequests,
  respondFriendRequest, cancelFriendRequest, listFriends, areFriends, visibleUserIds, removeFriend,
  upsertFriendSettings, canAssignTo, listAssignableUsers,
  getTask, listTasks, createTask, updateTask, deleteTask,
  effectiveTarget, isDueNow, periodAmount, isCompletedForCurrentPeriod, completeTask, lifetimeTotal, currentStreak, historyForTask,
  createTransfer, getTransfer, listIncomingTransfers, listOutgoingTransfers, resolveTransfer, cancelTransfer,
  listShoppingLists, getShoppingList, createShoppingList, canAccessShoppingList, listShoppingItems, getShoppingItem, addShoppingItem, toggleShoppingItem, deleteShoppingItem,
  progressBySphere,
  createNotification, unreadNotificationCount, listNotifications, markAllNotificationsRead,
  getSetting, setSetting,
};
