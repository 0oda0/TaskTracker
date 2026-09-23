const express = require("express");
const bcrypt = require("bcryptjs");
const repo = require("../repo");
const { isRateLimited, recordFailure, recordSuccess } = require("../rate-limit");

const router = express.Router();

router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  const ipKey = `ip:${req.ip}`;
  const userKey = `user:${username}`;

  if (isRateLimited(ipKey) || isRateLimited(userKey)) {
    return res.status(429).render("login", { error: "Слишком много попыток. Подождите 15 минут." });
  }

  const row = repo.getUserAuthRow(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    recordFailure(ipKey);
    recordFailure(userKey);
    return res.status(401).render("login", { error: "Неверный логин или пароль" });
  }
  recordSuccess(ipKey);
  recordSuccess(userKey);
  req.session.userId = row.id;
  req.session.sv = row.session_version;
  res.redirect("/");
});

router.get("/register", (req, res) => {
  res.render("register", { error: null });
});

router.post("/register", (req, res) => {
  const username = (req.body.username || "").trim();
  const displayName = (req.body.display_name || "").trim() || username;
  const password = req.body.password || "";

  if (username.length < 3 || password.length < 6) {
    return res.status(400).render("register", { error: "Логин от 3 символов, пароль от 6 символов" });
  }
  if (repo.getUserAuthRow(username)) {
    return res.status(400).render("register", { error: "Такой логин уже занят" });
  }
  const hash = bcrypt.hashSync(password, 10);
  const user = repo.createUser({ username, passwordHash: hash, displayName });
  req.session.userId = user.id;
  req.session.sv = 0;
  res.redirect("/");
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.redirect("/login");
});

module.exports = router;
