const express = require("express");
const repo = require("../repo");

const router = express.Router();

router.get("/", (req, res) => {
  const lists = repo.listShoppingLists(req.user.id).map((l) => ({
    list: l,
    items: repo.listShoppingItems(l.id),
  }));
  res.render("shopping", { lists });
});

router.post("/lists", (req, res) => {
  const name = (req.body.name || "").trim();
  if (name) repo.createShoppingList(name, req.user.id);
  res.redirect("/shopping");
});

router.post("/lists/:id/items", (req, res) => {
  const list = repo.getShoppingList(req.params.id);
  if (!list) return res.status(404).render("404");
  if (list.owner_id !== null && list.owner_id !== req.user.id) return res.status(403).send("Это чужой список");
  const name = (req.body.name || "").trim();
  if (name) repo.addShoppingItem(list.id, name, req.user.id);
  res.redirect("/shopping");
});

router.post("/items/:id/toggle", (req, res) => {
  repo.toggleShoppingItem(req.params.id);
  res.redirect("/shopping");
});

router.post("/items/:id/delete", (req, res) => {
  repo.deleteShoppingItem(req.params.id);
  res.redirect("/shopping");
});

module.exports = router;
