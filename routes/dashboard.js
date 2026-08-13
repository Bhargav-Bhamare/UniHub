const express = require('express');
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require('../middleware/auth');

// Student Dashboard
router.get('/student/dashboard', isAuthenticated, authorizeRoles('student'), (req, res) => {
  res.render('dashboard/student', { title: 'Student Dashboard - UniHub', user: req.session.user });
});

// Faculty Dashboard
router.get('/faculty/dashboard', isAuthenticated, authorizeRoles('faculty'), (req, res) => {
  res.render('dashboard/faculty', { title: 'Faculty Dashboard - UniHub', user: req.session.user });
});

// Coordinator Dashboard
router.get('/coordinator/dashboard', isAuthenticated, authorizeRoles('coordinator'), (req, res) => {
  res.render('dashboard/coordinator', { title: 'Coordinator Dashboard - UniHub', user: req.session.user });
});

// Admin Dashboard
router.get('/admin/dashboard', isAuthenticated, authorizeRoles('admin'), (req, res) => {
  res.render('dashboard/admin', { title: 'Admin Dashboard - UniHub', user: req.session.user });
});

module.exports = router;