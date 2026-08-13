// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/auth/login');
};

// Middleware to authorize specific roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/auth/login');
    }
    // normalize role strings to avoid mismatches (trim/case)
    const userRole = req.session.user.role ? String(req.session.user.role).trim().toLowerCase() : '';
    const allowed = roles.map(r => String(r).trim().toLowerCase());
    if (!allowed.includes(userRole)) {
      return res.status(403).send('Access Denied: You do not have permission to view this page.');
    }
    next();
  };
};

module.exports = { isAuthenticated, authorizeRoles };