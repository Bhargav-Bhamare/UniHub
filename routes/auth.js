const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

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

    await newUser.save();
    res.redirect('/auth/login');
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).send('Error creating account.');
  }
});

// GET: Login Page
router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Login - UniHub' });
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