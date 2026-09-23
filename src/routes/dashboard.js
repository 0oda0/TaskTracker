const express = require("express");
const repo = require("../repo");
const { dateKey, periodKey } = require("../period");

const router = express.Router();

function withProgress(t, now) {
  const target = repo.effectiveTarget(t);
  const amount = repo.periodAmount(t.id, periodKey(t.period_type, now));
  return { t, target, amount };
}

router.get("/", (req, res) => {
  const now = new Date();
  const mine = repo.listTasks({ assigneeId: req.user.id, status: "active" });

  const today = [];
  const overdue = [];
  for (const t of mine) {
    if (repo.isCompletedForCurrentPeriod(t, now)) continue;
    if (t.period_type === "once" && t.due_date && t.due_date < dateKey(now)) {
      overdue.push(withProgress(t, now));
    } else if (repo.isDueNow(t, now)) {
      today.push(withProgress(t, now));
    }
  }

  const incomingTransfers = repo.listIncomingTransfers(req.user.id);
  const friendCount = repo.listFriends(req.user.id).length;

  res.render("dashboard", { today, overdue, incomingCount: incomingTransfers.length, friendCount });
});

module.exports = router;
