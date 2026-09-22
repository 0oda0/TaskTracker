const express = require("express");
const repo = require("../repo");

const router = express.Router();

router.get("/", (req, res) => {
  res.render("admin-index", { stats: repo.adminStats() });
});

router.get("/users", (req, res) => {
  res.render("admin-users", { users: repo.listUsers() });
});

router.get("/users/:id", (req, res) => {
  const detail = repo.adminUserDetail(req.params.id);
  if (!detail) return res.status(404).render("404");
  res.render("admin-user-detail", { ...detail, error: null });
});

router.post("/users/:id/role", (req, res) => {
  const targetId = Number(req.params.id);
  const { error } = repo.setUserRole(targetId, req.body.role === "admin" ? "admin" : "user", req.user.id);
  if (error) {
    const detail = repo.adminUserDetail(targetId);
    return res.status(400).render("admin-user-detail", { ...detail, error });
  }
  res.redirect(`/admin/users/${targetId}`);
});

router.post("/users/:id/delete", (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) return res.status(400).send("Нельзя удалить самого себя");
  if (repo.isAdmin(targetId)) return res.status(400).send("Сначала снимите роль администратора");
  repo.eraseUser(targetId);
  res.redirect("/admin/users");
});

router.get("/support", (req, res) => {
  res.render("admin-support-inbox", { threads: repo.listSupportInbox() });
});

router.get("/support/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const user = repo.getUserById(userId);
  if (!user) return res.status(404).render("404");
  repo.markSupportReadByAdmin(userId);
  res.render("admin-support-thread", { user, messages: repo.listSupportThread(userId) });
});

router.post("/support/:userId/reply", (req, res) => {
  const userId = Number(req.params.userId);
  repo.sendAdminReply(userId, req.body.body);
  repo.createNotification(userId, "Ответ от поддержки", { link: "/support" });
  res.redirect(`/admin/support/${userId}`);
});

module.exports = router;
