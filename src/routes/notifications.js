const express = require("express");
const repo = require("../repo");

const router = express.Router();

router.get("/", (req, res) => {
  const items = repo.listNotifications(req.user.id);
  repo.markAllNotificationsRead(req.user.id);
  res.render("notifications", { items });
});

module.exports = router;
