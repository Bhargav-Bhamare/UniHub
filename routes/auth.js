const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const passport = require('passport');

// GET: Register Page
router.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Register - UniHub' });
});

// POST: Register Action
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, rollNumber, department, semester } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();

    // Check if user exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).send('Email already registered.');
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User
    const newUser = new User({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: role || 'student',
      rollNumber,
      department,
      semester
    });

    // Ensure semester stored as number when possible
    if (newUser.semester) {
      const n = Number(newUser.semester);
      if (!Number.isNaN(n)) newUser.semester = n;
    }

    await newUser.save();

    // Auto-login: set session and redirect to role dashboard
    req.session.user = {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      department: newUser.department,
      semester: newUser.semester,
      rollNumber: newUser.rollNumber
    };

    if (newUser.role === 'admin') return res.redirect('/admin/dashboard');
    if (newUser.role === 'faculty') return res.redirect('/faculty/dashboard');
    if (newUser.role === 'coordinator') return res.redirect('/coordinator/dashboard');
    return res.redirect('/student/dashboard');
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).send('Error creating account.');
  }
});

// GET: Login Page
router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Login - UniHub' });
});

// Google OAuth start
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google OAuth callback
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/auth/login' }), (req, res) => {
  // passport sets req.user (lean object from deserialize)
  const u = req.user;
  if (!u) return res.redirect('/auth/login');
  // set session for existing dashboard logic
  req.session.user = {
    id: u._id || u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department,
    semester: u.semester,
    rollNumber: u.rollNumber
  };
  if (u.role === 'admin') return res.redirect('/admin/dashboard');
  if (u.role === 'faculty') return res.redirect('/faculty/dashboard');
  if (u.role === 'coordinator') return res.redirect('/coordinator/dashboard');
  return res.redirect('/student/dashboard');
});

// Debug route: show whether Google client id is configured (does NOT expose secret)
router.get('/google/status', (req, res) => {
  const ok = !!process.env.GOOGLE_CLIENT_ID;
  res.json({ googleClientIdPresent: ok, clientId: ok ? String(process.env.GOOGLE_CLIENT_ID).slice(0,8) + '...' : null, callbackUrl: process.env.GOOGLE_CALLBACK_URL || null });
});

// POST: Login Action
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).send('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send('Invalid email or password.');
    }

    // Save session (include semester and rollNumber for student dashboards)
    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      semester: user.semester,
      rollNumber: user.rollNumber
    };

    // Redirect based on role
    if (user.role === 'admin') return res.redirect('/admin/dashboard');
    if (user.role === 'faculty') return res.redirect('/faculty/dashboard');
    if (user.role === 'coordinator') return res.redirect('/coordinator/dashboard');
    return res.redirect('/student/dashboard');

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).send('Error logging in.');
  }
});

// GET: Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/auth/login');
  });
});

module.exports = router;