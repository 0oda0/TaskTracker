const express = require("express");
const repo = require("../repo");

const router = express.Router();

router.get("/", (req, res) => {
  res.render("transfers", {
    incoming: repo.listIncomingTransfers(req.user.id),
    outgoing: repo.listOutgoingTransfers(req.user.id),
  });
});

router.post("/:id/accept", (req, res) => {
  const tr = repo.getTransfer(req.params.id);
  if (!tr || tr.to_user_id !== req.user.id) return res.status(403).send("Нет доступа");
  repo.resolveTransfer(tr.id, true);
  res.redirect("/transfers");
});

router.post("/:id/decline", (req, res) => {
  const tr = repo.getTransfer(req.params.id);
  if (!tr || tr.to_user_id !== req.user.id) return res.status(403).send("Нет доступа");
  repo.resolveTransfer(tr.id, false);
  res.redirect("/transfers");
});

router.post("/:id/cancel", (req, res) => {
  const tr = repo.getTransfer(req.params.id);
  if (!tr || tr.from_user_id !== req.user.id) return res.status(403).send("Нет доступа");
  repo.cancelTransfer(tr.id);
  res.redirect("/transfers");
});

module.exports = router;
