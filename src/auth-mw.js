const { getUserById, listIncomingTransfers, unreadNotificationCount } = require("./repo");

function attachUser(req, res, next) {
  const userId = req.session && req.session.userId;
  req.user = userId ? getUserById(userId) : null;
  res.locals.currentUser = req.user;
  res.locals.pendingTransferCount = req.user ? listIncomingTransfers(req.user.id).length : 0;
  res.locals.unreadNotifications = req.user ? unreadNotificationCount(req.user.id) : 0;
  res.locals.path = req.path;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect("/login");
  next();
}

module.exports = { attachUser, requireAuth };
