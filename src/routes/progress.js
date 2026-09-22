const express = require("express");
const repo = require("../repo");

const router = express.Router();

router.get("/", (req, res) => {
  const users = repo.listUsers();
  const byUser = users.map((u) => ({ user: u, spheres: repo.progressBySphere(u.id) }));
  res.render("progress", { byUser });
});

module.exports = router;
