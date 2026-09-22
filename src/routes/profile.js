const express = require("express");
const bcrypt = require("bcryptjs");
const repo = require("../repo");

const router = express.Router();
const AVATAR_COLORS = ["violet", "teal", "amber", "rose", "sky", "lime"];

router.get("/", (req, res) => {
  res.render("profile", { avatarColors: AVATAR_COLORS, error: null, success: null });
});

router.post("/", (req, res) => {
  const displayName = (req.body.display_name || "").trim();
  const avatarColor = AVATAR_COLORS.includes(req.body.avatar_color) ? req.body.avatar_color : "violet";
  if (!displayName) return res.status(400).render("profile", { avatarColors: AVATAR_COLORS, error: "Имя не может быть пустым", success: null });
  repo.updateProfile(req.user.id, { displayName, avatarColor });
  res.redirect("/profile");
});

router.post("/password", (req, res) => {
  const { error, sessionVersion } = repo.changePassword(req.user.id, req.body.current_password, req.body.new_password, bcrypt);
  if (error) return res.status(400).render("profile", { avatarColors: AVATAR_COLORS, error, success: null });
  req.session.sv = sessionVersion;
  res.render("profile", { avatarColors: AVATAR_COLORS, error: null, success: "Пароль изменён" });
});

router.post("/friend-code/regenerate", (req, res) => {
  repo.regenerateFriendCode(req.user.id);
  res.redirect("/profile");
});

router.post("/theme", (req, res) => {
  repo.setTheme(req.user.id, req.body.theme);
  res.redirect(req.get("referer") || "/profile");
});

router.post("/delete", (req, res) => {
  const row = repo.getUserAuthRow(req.user.username);
  if (!bcrypt.compareSync(req.body.password || "", row.password_hash)) {
    return res.status(400).render("profile", { avatarColors: AVATAR_COLORS, error: "Неверный пароль", success: null });
  }
  repo.eraseUser(req.user.id);
  req.session = null;
  res.redirect("/login");
});

module.exports = router;
