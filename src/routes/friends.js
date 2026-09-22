const express = require("express");
const repo = require("../repo");

const router = express.Router();

router.get("/", (req, res) => {
  res.render("friends", {
    friends: repo.listFriends(req.user.id),
    incoming: repo.listIncomingFriendRequests(req.user.id),
    outgoing: repo.listOutgoingFriendRequests(req.user.id),
    error: null,
  });
});

router.post("/request", (req, res) => {
  const { error } = repo.sendFriendRequest(req.user.id, req.body.username);
  if (error) {
    return res.status(400).render("friends", {
      friends: repo.listFriends(req.user.id),
      incoming: repo.listIncomingFriendRequests(req.user.id),
      outgoing: repo.listOutgoingFriendRequests(req.user.id),
      error,
    });
  }
  res.redirect("/friends");
});

router.post("/:id/accept", (req, res) => {
  repo.respondFriendRequest(req.params.id, req.user.id, true);
  res.redirect("/friends");
});

router.post("/:id/decline", (req, res) => {
  repo.respondFriendRequest(req.params.id, req.user.id, false);
  res.redirect("/friends");
});

router.post("/:id/cancel", (req, res) => {
  repo.cancelFriendRequest(req.params.id, req.user.id);
  res.redirect("/friends");
});

router.post("/:friendId/remove", (req, res) => {
  repo.removeFriend(req.user.id, Number(req.params.friendId));
  res.redirect("/friends");
});

router.post("/:friendId/settings", (req, res) => {
  repo.upsertFriendSettings(req.user.id, Number(req.params.friendId), {
    tag: req.body.tag,
    canAssign: req.body.can_assign === "1",
  });
  res.redirect("/friends");
});

module.exports = router;
