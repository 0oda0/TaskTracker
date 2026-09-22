const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

router.get("/login", (req, res) => {
  if (req.user) return res.redirect("/");
  res.render("login", { error: null });
});

router.post("/login", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).render("login", { error: "Неверный логин или пароль" });
  }
  req.session.userId = row.id;
  res.redirect("/");
});

router.get("/register", (req, res) => {
  if (req.user) return res.redirect("/");
  res.render("register", { error: null });
});

router.post("/register", (req, res) => {
  const username = (req.body.username || "").trim();
  const displayName = (req.body.display_name || "").trim() || username;
  const password = req.body.password || "";

  if (username.length < 3 || password.length < 6) {
    return res.status(400).render("register", { error: "Логин от 3 символов, пароль от 6 символов" });
  }
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    return res.status(400).render("register", { error: "Такой логин уже занят" });
  }
  const hash = bcrypt.hashSync(password, 10);
  const id = db.prepare(
    "INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)"
  ).run(username, hash, displayName).lastInsertRowid;
  req.session.userId = id;
  res.redirect("/");
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.redirect("/login");
});

module.exports = router;
