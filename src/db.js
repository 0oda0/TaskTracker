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

CREATE TABLE IF NOT EXISTS shopping_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);

-- Small key/value store, currently just tracks which ISO week the weekly
-- debt check last ran for (see src/debt.js), so restarts don't double-run it.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const DEFAULT_SPHERES = ["Работа/учёба", "Физ. нагрузка", "Рутина", "Личное"];
const insertSphere = db.prepare("INSERT OR IGNORE INTO spheres (name) VALUES (?)");
for (const name of DEFAULT_SPHERES) insertSphere.run(name);

const sharedList = db.prepare("SELECT id FROM shopping_lists WHERE owner_id IS NULL").get();
if (!sharedList) {
  db.prepare("INSERT INTO shopping_lists (name, owner_id) VALUES (?, NULL)").run("Общий список");
}

module.exports = db;
