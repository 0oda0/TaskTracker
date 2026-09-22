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
  if (name) repo.createShoppingList(name, req.user.id, req.body.shared === "1");
  res.redirect("/shopping");
});

router.post("/lists/:id/items", (req, res) => {
  const list = repo.getShoppingList(req.params.id);
  if (!list || !repo.canAccessShoppingList(req.user.id, list)) return res.status(404).render("404");
  const name = (req.body.name || "").trim();
  if (name) repo.addShoppingItem(list.id, name, req.user.id);
  res.redirect("/shopping");
});

router.post("/items/:id/toggle", (req, res) => {
  const item = repo.getShoppingItem(req.params.id);
  const list = item && repo.getShoppingList(item.list_id);
  if (!list || !repo.canAccessShoppingList(req.user.id, list)) return res.status(404).render("404");
  repo.toggleShoppingItem(item.id);
  res.redirect("/shopping");
});

router.post("/items/:id/delete", (req, res) => {
  const item = repo.getShoppingItem(req.params.id);
  const list = item && repo.getShoppingList(item.list_id);
  if (!list || !repo.canAccessShoppingList(req.user.id, list)) return res.status(404).render("404");
  repo.deleteShoppingItem(item.id);
  res.redirect("/shopping");
});

module.exports = router;
