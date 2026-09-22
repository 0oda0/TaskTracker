const express = require("express");
const repo = require("../repo");
const { periodKey } = require("../period");

const router = express.Router();

const WEEKDAYS = [
  { value: 1, label: "Пн" }, { value: 2, label: "Вт" }, { value: 3, label: "Ср" },
  { value: 4, label: "Чт" }, { value: 5, label: "Пт" }, { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
];

function parseTaskFields(body) {
  const { title, description, sphere_id, period_type, due_date, weekday, month_day, target_count } = body;
  if (!title || !title.trim()) return { error: "Название обязательно" };
  if (!["once", "daily", "weekly", "monthly"].includes(period_type)) return { error: "Некорректная периодичность" };
  if (period_type === "once" && !due_date) return { error: "Укажите дату для разовой задачи" };

  return {
    fields: {
      title: title.trim(),
      description: description && description.trim(),
      sphereId: Number(sphere_id),
      periodType: period_type,
      dueDate: period_type === "once" ? due_date : null,
      weekday: period_type === "weekly" && weekday !== "" ? Number(weekday) : null,
      monthDay: period_type === "monthly" && month_day !== "" ? Number(month_day) : null,
      targetCount: target_count && Number(target_count) > 0 ? Number(target_count) : null,
    },
  };
}

router.get("/", (req, res) => {
  const sphereId = req.query.sphere ? Number(req.query.sphere) : null;
  const onlyMine = req.query.mine === "1";
  const tasks = repo.listTasks({
    assigneeId: onlyMine ? req.user.id : null,
    sphereId,
    status: "active",
  });
  const now = new Date();
  const rows = tasks.map((t) => ({
    t,
    target: repo.effectiveTarget(t),
    amount: repo.periodAmount(t.id, periodKey(t.period_type, now)),
    done: repo.isCompletedForCurrentPeriod(t, now),
  }));
  res.render("tasks", { rows, spheres: repo.listSpheres(), sphereId, onlyMine });
});

router.get("/new", (req, res) => {
  res.render("task-new", { spheres: repo.listSpheres(), users: repo.listUsers(), weekdays: WEEKDAYS, error: null, task: null });
});

router.post("/", (req, res) => {
  const { error, fields } = parseTaskFields(req.body);
  if (error) {
    return res.status(400).render("task-new", { spheres: repo.listSpheres(), users: repo.listUsers(), weekdays: WEEKDAYS, error, task: null });
  }
  const assigneeId = Number(req.body.assignee_id) || req.user.id;
  repo.createTask({ ...fields, createdBy: req.user.id, assigneeId });
  res.redirect("/tasks");
});

router.get("/:id/edit", (req, res) => {
  const task = repo.getTask(req.params.id);
  if (!task) return res.status(404).render("404");
  if (task.created_by !== req.user.id) return res.status(403).send("Только автор может редактировать задачу");
  res.render("task-edit", { task, spheres: repo.listSpheres(), weekdays: WEEKDAYS, error: null });
});

router.post("/:id/edit", (req, res) => {
  const task = repo.getTask(req.params.id);
  if (!task) return res.status(404).render("404");
  if (task.created_by !== req.user.id) return res.status(403).send("Только автор может редактировать задачу");

  const { error, fields } = parseTaskFields(req.body);
  if (error) return res.status(400).render("task-edit", { task, spheres: repo.listSpheres(), weekdays: WEEKDAYS, error });

  repo.updateTask(task.id, fields);
  res.redirect(`/tasks/${task.id}`);
});

router.get("/:id", (req, res) => {
  const task = repo.getTask(req.params.id);
  if (!task) return res.status(404).render("404");
  const now = new Date();
  const target = repo.effectiveTarget(task);
  const amount = repo.periodAmount(task.id, periodKey(task.period_type, now));
  res.render("task-detail", {
    task,
    target,
    amount,
    remaining: Math.max(0, target - amount),
    done: amount >= target,
    lifetime: repo.lifetimeTotal(task.id),
    streak: repo.currentStreak(task, now),
    history: repo.historyForTask(task, now, task.period_type === "monthly" ? 6 : task.period_type === "weekly" ? 8 : 14),
    isAssignee: task.assignee_id === req.user.id,
    isCreator: task.created_by === req.user.id,
    otherUsers: repo.listUsers().filter((u) => u.id !== req.user.id),
  });
});

router.post("/:id/complete", (req, res) => {
  const task = repo.getTask(req.params.id);
  if (!task) return res.status(404).render("404");
  if (task.assignee_id !== req.user.id) return res.status(403).send("Только исполнитель может отметить задачу выполненной");
  const rawAmount = Number(req.body.amount);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? Math.floor(rawAmount) : 1;
  repo.completeTask(task, req.user.id, amount);
  res.redirect(req.get("referer") || "/tasks");
});

router.post("/:id/delete", (req, res) => {
  const task = repo.getTask(req.params.id);
  if (!task) return res.status(404).render("404");
  if (task.created_by !== req.user.id) return res.status(403).send("Только автор может удалить задачу");
  repo.deleteTask(task.id);
  res.redirect("/tasks");
});

// Assignee offers the task to someone else.
router.post("/:id/transfer/offer", (req, res) => {
  const task = repo.getTask(req.params.id);
  if (!task || task.assignee_id !== req.user.id) return res.status(403).send("Только исполнитель может передать задачу");
  const toUserId = Number(req.body.to_user_id);
  if (!toUserId || toUserId === req.user.id) return res.status(400).send("Некорректный получатель");
  repo.createTransfer({ taskId: task.id, direction: "offer", fromUserId: req.user.id, toUserId });
  res.redirect(`/tasks/${task.id}`);
});

// Someone else asks to take over the task from its current assignee.
router.post("/:id/transfer/request", (req, res) => {
  const task = repo.getTask(req.params.id);
  if (!task || task.assignee_id === req.user.id) return res.status(400).send("Вы уже исполнитель этой задачи");
  repo.createTransfer({ taskId: task.id, direction: "request", fromUserId: req.user.id, toUserId: task.assignee_id });
  res.redirect(`/tasks/${task.id}`);
});

module.exports = router;
