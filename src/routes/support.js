const express = require("express");
const repo = require("../repo");

const router = express.Router();

router.get("/", (req, res) => {
  repo.markSupportReadByUser(req.user.id);
  res.render("support", { messages: repo.listSupportThread(req.user.id) });
});

router.post("/send", (req, res) => {
  repo.sendSupportMessage(req.user.id, req.body.body);
  for (const admin of repo.listUsers().filter((u) => u.role === "admin")) {
    repo.createNotification(admin.id, `Новое сообщение в поддержку от ${req.user.display_name}`, { link: `/admin/support/${req.user.id}` });
  }
  res.redirect("/support");
});

module.exports = router;
