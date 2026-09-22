const repo = require("./repo");

function attachUser(req, res, next) {
  const userId = req.session && req.session.userId;
  let user = userId ? repo.getUserById(userId) : null;

  // A password change bumps session_version server-side; any cookie still
  // carrying the old value belongs to a session that should be dead.
  if (user) {
    const authRow = repo.getUserAuthRow(user.username);
    if (!authRow || authRow.session_version !== req.session.sv) {
      req.session = null;
      user = null;
    }
  }

  req.user = user;
  if (user) repo.touchLastSeen(user.id);

  res.locals.currentUser = user;
  res.locals.pendingTransferCount = user ? repo.listIncomingTransfers(user.id).length : 0;
  res.locals.unreadNotifications = user ? repo.unreadNotificationCount(user.id) : 0;
  res.locals.pendingFriendRequests = user ? repo.listIncomingFriendRequests(user.id).length : 0;
  res.locals.unreadMessages = user ? repo.unreadMessageCount(user.id) : 0;
  res.locals.unreadSupportForAdmin = user && user.role === "admin" ? repo.unreadSupportTotalForAdmin() : 0;
  res.locals.path = req.path;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect("/login");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(404).render("404");
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin };
