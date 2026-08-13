const express = require('express');
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require('../middleware/auth');
const User = require('../models/User');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Attendance = require('../models/Attendance');
const Event = require('../models/Event');
const Placement = require('../models/Placement');
const Notification = require('../models/Notification');

// Student Dashboard
router.get('/student/dashboard', isAuthenticated, authorizeRoles('student'), async (req, res) => {
  try {
    const user = req.session.user;
    const assignments = await Assignment.find({ department: user.department }).sort({ dueDate: 1 }).limit(6).lean();
    const events = await Event.find({}).sort({ eventDate: 1 }).limit(6).lean();
    const placements = await Placement.find({}).sort({ deadline: 1 }).limit(6).lean();

    // compute attendance percentages per subject for this student
    const attendanceDocs = await Attendance.find({ department: user.department, semester: user.semester }).lean();
    const totalBySubject = {};
    const presentBySubject = {};
    attendanceDocs.forEach(doc => {
      const subj = doc.subject || 'General';
      totalBySubject[subj] = (totalBySubject[subj] || 0) + 1;
      const found = (doc.records || []).find(r => String(r.student) === String(user.id) && r.status === 'Present');
      if (found) presentBySubject[subj] = (presentBySubject[subj] || 0) + 1;
    });
    const attendance = Object.keys(totalBySubject).map(subj => ({ subject: subj, percent: Math.round((presentBySubject[subj] || 0) / totalBySubject[subj] * 100) }));

    const mapDate = (d) => (d ? new Date(d).toISOString().slice(0,10) : 'TBD');
    assignments.forEach(a => a.dueDate = mapDate(a.dueDate));
    events.forEach(e => e.date = mapDate(e.eventDate || e.date));
    placements.forEach(p => p.date = mapDate(p.deadline || p.date));

    res.render('dashboard/student', { title: 'Student Dashboard - UniHub', user, assignments, events, placements, attendance });
  } catch (err) {
    console.error('Student dashboard error:', err);
    res.render('dashboard/student', { title: 'Student Dashboard - UniHub', user: req.session.user });
  }
});

// Faculty Dashboard
router.get('/faculty/dashboard', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const user = req.session.user;
    const assignments = await Assignment.find({ faculty: user.id }).sort({ createdAt: -1 }).limit(8).lean();
    const assignmentIds = assignments.map(a => a._id);
    const submissions = await Submission.find({ assignment: { $in: assignmentIds } }).populate('student').sort({ createdAt: -1 }).limit(8).lean();
    const subs = submissions.map(s => ({ studentName: s.student && s.student.name ? s.student.name : 'Student', assignment: (s.assignment && s.assignment.title) ? s.assignment.title : String(s.assignment), status: s.status }));
    res.render('dashboard/faculty', { title: 'Faculty Dashboard - UniHub', user, assignments, submissions: subs });
  } catch (err) {
    console.error('Faculty dashboard error:', err);
    res.render('dashboard/faculty', { title: 'Faculty Dashboard - UniHub', user: req.session.user });
  }
});

// Coordinator Dashboard
router.get('/coordinator/dashboard', isAuthenticated, authorizeRoles('coordinator'), async (req, res) => {
  try {
    const user = req.session.user;
    const events = await Event.find({}).sort({ eventDate: 1 }).limit(8).lean();
    const approvals = [{ id: 1, type: 'Event', title: 'Hackathon', requester: 'Prof. Sharma' }];
    res.render('dashboard/coordinator', { title: 'Coordinator Dashboard - UniHub', user, events, approvals });
  } catch (err) {
    console.error('Coordinator dashboard error:', err);
    res.render('dashboard/coordinator', { title: 'Coordinator Dashboard - UniHub', user: req.session.user });
  }
});

// Admin Dashboard
router.get('/admin/dashboard', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const placements = await Placement.find({}).sort({ createdAt: -1 }).lean();
    res.render('dashboard/admin', { title: 'Admin Dashboard', placements, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// submissions
router.post('/submission', isAuthenticated, async (req, res) => {
  try {
    const { assignmentId, content, link } = req.body;
    const submission = new Submission({ assignment: assignmentId, student: req.session.user.id, content: content || link });
    await submission.save();
    res.json({ success: true, submission });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// register for event
router.post('/events/register', isAuthenticated, async (req, res) => {
  try {
    const { eventId } = req.body;
    await Event.findByIdAndUpdate(eventId, { $addToSet: { registeredStudents: req.session.user.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// apply for placement
router.post('/placements/apply', isAuthenticated, async (req, res) => {
  try {
    const { placementId } = req.body;
    await Placement.findByIdAndUpdate(placementId, { $addToSet: { applicants: req.session.user.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// faculty creating assignment
router.post('/faculty/assignments/new', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const { title, description, subject, dueDate } = req.body;
    const assignment = new Assignment({ title, description, subject, dueDate, createdBy: req.session.user.id });
    await assignment.save();
    res.json({ success: true, assignment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// faculty attendance
router.post('/faculty/attendance', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const { date, presentStudents } = req.body; // presentStudents => [studentIds]
    const docs = (presentStudents || []).map(sid => ({ date, student: sid, status: 'present', recordedBy: req.session.user.id }));
    await Attendance.insertMany(docs);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// events
router.post('/events/new', isAuthenticated, authorizeRoles('coordinator','admin'), async (req, res) => {
  try {
    const { title, description, eventDate, location } = req.body;
    const e = new Event({ title, description, eventDate, location, createdBy: req.session.user.id });
    await e.save();
    res.json({ success: true, event: e });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// placements
router.post('/placements/new', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const { company, role, description } = req.body;
    const p = new Placement({ company, role, description, createdBy: req.session.user.id });
    await p.save();
    res.json({ success: true, placement: p });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// notifications
router.get('/notifications', isAuthenticated, async (req, res) => {
  try {
    const notes = await Notification.find({ user: req.session.user.id }).sort({ createdAt: -1 }).lean();
    res.render('dashboard/notifications', { title: 'Notifications', notes, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/api/notifications/:id/read', isAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    await Notification.findByIdAndUpdate(id, { read: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// grades
router.get('/grades', isAuthenticated, async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.session.user.id }).populate('assignment').sort({ createdAt: -1 }).lean();
    res.render('dashboard/grades', { title: 'Grades', submissions, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// activity
router.get('/activity', isAuthenticated, async (req, res) => {
  try {
    const assignments = await Assignment.find({}).sort({ createdAt: -1 }).limit(10).lean();
    const events = await Event.find({}).sort({ eventDate: 1 }).limit(10).lean();
    const submissions = await Submission.find({}).sort({ createdAt: -1 }).limit(10).populate('student').lean();
    res.render('dashboard/activity', { title: 'Activity', assignments, events, submissions, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// calendar
router.get('/calendar', isAuthenticated, async (req, res) => {
  try {
    const assignments = await Assignment.find({}).sort({ dueDate: 1 }).limit(20).lean();
    const events = await Event.find({}).sort({ eventDate: 1 }).limit(20).lean();
    res.render('dashboard/calendar', { title: 'Calendar', assignments, events, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// profile
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id).lean();
    res.render('dashboard/profile', { title: 'Profile', user, userSession: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/profile', isAuthenticated, async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findByIdAndUpdate(req.session.user.id, updates, { new: true }).lean();
    req.session.user = Object.assign({}, req.session.user, { name: user.name, department: user.department });
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
