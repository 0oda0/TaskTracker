const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "tasktracker.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  friend_code TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  avatar_color TEXT NOT NULL DEFAULT 'violet',
  theme TEXT NOT NULL DEFAULT 'dark' CHECK(theme IN ('dark','light')),
  session_version INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spheres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  sphere_id INTEGER NOT NULL REFERENCES spheres(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  assignee_id INTEGER NOT NULL REFERENCES users(id),
  period_type TEXT NOT NULL CHECK(period_type IN ('once','daily','weekly','monthly')),
  due_date TEXT,
  weekday INTEGER,
  month_day INTEGER,
  target_count INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per logged amount (not just per period): a quantity task like
-- "100 отжиманий" can be topped up in several increments within one period.
-- "Done for period" and lifetime totals are derived by summing amount, so
-- there is no UNIQUE(task_id, period_key) here (see repo.js completeTask).
CREATE TABLE IF NOT EXISTS task_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  period_key TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_completions_task_period ON task_completions(task_id, period_key);

CREATE TABLE IF NOT EXISTS task_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('offer','request')),
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  addressee_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);

-- One row = user_id's own settings about friend_id: a personal label
-- ("жена", "друг"...) and whether user_id allows friend_id to assign
-- tasks to user_id. Asymmetric on purpose - both fields are always read
-- from the assignee's/labeler's own row, never the other side's.
CREATE TABLE IF NOT EXISTS friend_settings (
  user_id INTEGER NOT NULL REFERENCES users(id),
  friend_id INTEGER NOT NULL REFERENCES users(id),
  tag TEXT,
  can_assign INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, friend_id)
);

-- owner_id NULL = shared with created_by's friends (not a global list anymore).
CREATE TABLE IF NOT EXISTS shopping_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_bought INTEGER NOT NULL DEFAULT 0,
  added_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);

-- Direct messages between friends. Both users must be friends to write here
-- (enforced in repo.js, not by a constraint - friendships can end later
-- without invalidating history).
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_user_id, to_user_id, created_at);

-- One row per message in a user's support thread with the admins (fromAdmin
-- distinguishes direction; no separate "thread" entity, grouped by user_id).
CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  from_admin INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  read_by_admin INTEGER NOT NULL DEFAULT 0,
  read_by_user INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_messages(user_id, created_at);

-- Small key/value store, currently just tracks which ISO week the weekly
-- debt check last ran for (see src/debt.js), so restarts don't double-run it.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// --- migrations for columns added after the first deploy: CREATE TABLE IF
// NOT EXISTS is a no-op on a table that already exists, so any new column
// needs an explicit ALTER (guarded by checking it isn't already there, so
// this stays safe to run on every boot, fresh DB or not).
const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
if (!userColumns.has("friend_code")) db.exec("ALTER TABLE users ADD COLUMN friend_code TEXT");
if (!userColumns.has("role")) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
if (!userColumns.has("avatar_color")) db.exec("ALTER TABLE users ADD COLUMN avatar_color TEXT NOT NULL DEFAULT 'violet'");
if (!userColumns.has("theme")) db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark'");
if (!userColumns.has("session_version")) db.exec("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0");
if (!userColumns.has("last_seen_at")) db.exec("ALTER TABLE users ADD COLUMN last_seen_at TEXT");

const notifColumns = new Set(db.prepare("PRAGMA table_info(notifications)").all().map((c) => c.name));
if (!notifColumns.has("link")) db.exec("ALTER TABLE notifications ADD COLUMN link TEXT");

// Backfill friend codes for any pre-existing accounts (new registrations
// already get one at INSERT time - see repo.createUser).
const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function randomFriendCode() {
  let out = "";
  for (let i = 0; i < 8; i++) out += codeAlphabet[Math.floor(Math.random() * codeAlphabet.length)];
  return out;
}
const needCodes = db.prepare("SELECT id FROM users WHERE friend_code IS NULL").all();
for (const { id } of needCodes) {
  let code;
  do { code = randomFriendCode(); } while (db.prepare("SELECT 1 FROM users WHERE friend_code = ?").get(code));
  db.prepare("UPDATE users SET friend_code = ? WHERE id = ?").run(code, id);
}

// If this instance predates roles, promote whoever registered first -
// there's otherwise no way to reach /admin at all on an upgraded install.
const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get();
if (!hasAdmin) {
  const first = db.prepare("SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1").get();
  if (first) db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(first.id);
}

const DEFAULT_SPHERES = ["Работа/учёба", "Физ. нагрузка", "Рутина", "Личное"];
const insertSphere = db.prepare("INSERT OR IGNORE INTO spheres (name) VALUES (?)");
for (const name of DEFAULT_SPHERES) insertSphere.run(name);

module.exports = db;
