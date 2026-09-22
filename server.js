const express = require("express");
const path = require("node:path");
const cookieSession = require("cookie-session");
const { attachUser, requireAuth } = require("./src/auth-mw");
const { checkWeeklyDebts } = require("./src/debt");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));
app.locals.helpers = require("./src/view-helpers");

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieSession({
  name: "session",
  secret: process.env.SESSION_SECRET || "dev-secret-change-me",
  sameSite: "lax",
  secure: process.env.COOKIE_SECURE === "true",
  maxAge: 30 * 24 * 60 * 60 * 1000,
}));
app.use(attachUser);

app.use("/", require("./src/routes/auth"));
app.use("/", requireAuth, require("./src/routes/dashboard"));
app.use("/friends", requireAuth, require("./src/routes/friends"));
app.use("/tasks", requireAuth, require("./src/routes/tasks"));
app.use("/transfers", requireAuth, require("./src/routes/transfers"));
app.use("/shopping", requireAuth, require("./src/routes/shopping"));
app.use("/progress", requireAuth, require("./src/routes/progress"));
app.use("/notifications", requireAuth, require("./src/routes/notifications"));

app.use((req, res) => res.status(404).render("404"));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`TaskTracker listening on :${port}`));

// Weekly debt check for daily quantity tasks (Mon..Sun, closes Sunday 18:01).
// Runs at startup to catch up after downtime, then every minute - both calls
// are idempotent per ISO week (see src/debt.js).
checkWeeklyDebts();
setInterval(checkWeeklyDebts, 60 * 1000);
