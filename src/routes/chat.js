const express = require("express");
const repo = require("../repo");

const router = express.Router();

router.get("/:friendId", (req, res) => {
  const friendId = Number(req.params.friendId);
  if (!repo.areFriends(req.user.id, friendId)) return res.status(404).render("404");
  const friend = repo.getUserById(friendId);
  repo.markConversationRead(req.user.id, friendId);
  res.render("chat", {
    friend,
    messages: repo.listConversation(req.user.id, friendId),
  });
});

router.post("/:friendId/send", (req, res) => {
  const friendId = Number(req.params.friendId);
  const { error } = repo.sendMessage(req.user.id, friendId, req.body.body);
  if (error) return res.status(400).send(error);
  repo.createNotification(friendId, `Новое сообщение от ${req.user.display_name}`, { link: `/chat/${req.user.id}` });
  res.redirect(`/chat/${friendId}`);
});

module.exports = router;
