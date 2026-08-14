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
const Lecture = require('../models/Lecture');
const Fee = require('../models/Fee');
const Result = require('../models/Result');
const Timetable = require('../models/Timetable');
const LeaveRequest = require('../models/LeaveRequest');
const bcrypt = require('bcryptjs');

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

    // today's lectures
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);
    const lectures = await Lecture.find({ department: user.department, semester: user.semester, date: { $gte: startOfDay, $lte: endOfDay } }).sort({ startTime: 1 }).populate('faculty', 'name').lean();

    // fees summary
    const fee = await Fee.findOne({ student: user.id }).lean();

    // recent results
    const results = await Result.find({ student: user.id }).sort({ examDate: -1 }).limit(8).lean();

    // timetable for week
    const timetable = await Timetable.findOne({ department: user.department, semester: user.semester }).lean();

    // announcements (fall back to notifications)
    const announcements = await Notification.find({ $or: [{ department: user.department }, { user: user.id }, { type: 'announcement' }] }).sort({ createdAt: -1 }).limit(8).lean();

    res.render('dashboard/student', { title: 'Student Dashboard - UniHub', user, assignments, events, placements, attendance, lectures, fee, results, timetable, announcements });
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

// Faculty - assignments listing page (GET) and new assignment page
router.get('/faculty/assignments', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const user = req.session.user;
    const assignments = await Assignment.find({ faculty: user.id }).sort({ createdAt: -1 }).lean();
    const assignmentIds = assignments.map(a => a._id);
    const submissions = await Submission.find({ assignment: { $in: assignmentIds } }).populate('student').sort({ createdAt: -1 }).limit(20).lean();
    res.render('dashboard/faculty', { title: 'Faculty Assignments - UniHub', user, assignments, submissions });
  } catch (err) {
    console.error('Faculty assignments page error:', err);
    res.status(500).send('Server error');
  }
});

router.get('/faculty/assignments/new', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const user = req.session.user;
    // reuse faculty dashboard which includes the create form
    const assignments = await Assignment.find({ faculty: user.id }).sort({ createdAt: -1 }).lean();
    const submissions = [];
    res.render('dashboard/faculty', { title: 'Create Assignment - UniHub', user, assignments, submissions });
  } catch (err) {
    console.error('Faculty new assignment page error:', err);
    res.status(500).send('Server error');
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
    const events = await Event.find({}).sort({ eventDate: -1 }).limit(20).lean();
    const users = await User.find({}).sort({ createdAt: -1 }).limit(200).lean();
    // simple stats
    const stats = {
      users: await User.countDocuments(),
      events: await Event.countDocuments(),
      placements: await Placement.countDocuments(),
    };
    res.render('dashboard/admin', { title: 'Admin Dashboard', placements, events, users, stats, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Admin pages for navbar
router.get('/admin/users', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    const events = await Event.find({}).sort({ eventDate: -1 }).limit(20).lean();
    const placements = await Placement.find({}).sort({ createdAt: -1 }).lean();
    const stats = { users: await User.countDocuments(), events: await Event.countDocuments(), placements: await Placement.countDocuments() };
    res.render('dashboard/admin', { title: 'Manage Users - Admin', users, events, placements, stats, placements, user: req.session.user });
  } catch (err) {
    console.error('Admin users page error:', err);
    res.status(500).send('Server error');
  }
});

router.get('/admin/events', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const events = await Event.find({}).sort({ eventDate: -1 }).lean();
    const users = await User.find({}).limit(200).lean();
    const placements = await Placement.find({}).lean();
    const stats = { users: await User.countDocuments(), events: await Event.countDocuments(), placements: await Placement.countDocuments() };
    res.render('dashboard/admin', { title: 'Manage Events - Admin', users, events, placements, stats, user: req.session.user });
  } catch (err) {
    console.error('Admin events page error:', err);
    res.status(500).send('Server error');
  }
});

router.get('/admin/placements', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const placements = await Placement.find({}).sort({ createdAt: -1 }).lean();
    const users = await User.find({}).limit(200).lean();
    const events = await Event.find({}).limit(200).lean();
    const stats = { users: await User.countDocuments(), events: await Event.countDocuments(), placements: await Placement.countDocuments() };
    res.render('dashboard/admin', { title: 'Manage Placements - Admin', users, events, placements, stats, user: req.session.user });
  } catch (err) {
    console.error('Admin placements page error:', err);
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

// Admin user management
router.post('/admin/users/create', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, email, role, department } = req.body;
    if(!email || !name) return res.status(400).json({ success:false, message:'name and email required' });
    // basic creation with default password (should force reset)
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if(existing) return res.status(400).json({ success:false, message:'User exists' });
    // generate a temporary password and hash it
    const tempPassword = Math.random().toString(36).slice(-8) || 'TempPass1!';
    const hashed = await bcrypt.hash(tempPassword, 10);
    const user = new User({ name: name.trim(), email: email.trim().toLowerCase(), role: role || 'student', department, password: hashed });
    await user.save();
    // return temporary password so admin can share it (for local/testing use)
    res.json({ success:true, user, tempPassword });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ success:false });
  }
});

router.post('/admin/users/:id/update', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    delete updates._id;
    // If password provided, hash it before update
    if(updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    const user = await User.findByIdAndUpdate(id, updates, { new: true }).lean();
    res.json({ success:true, user });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ success:false });
  }
});

// Get single user (JSON) for edit modal
router.get('/admin/users/:id', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id).lean();
    if(!user) return res.status(404).json({ success:false, message: 'Not found' });
    // do not send password hash
    delete user.password;
    res.json({ success:true, user });
  } catch (err) {
    console.error('Admin get user error:', err);
    res.status(500).json({ success:false });
  }
});

router.post('/admin/users/:id/delete', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    await User.findByIdAndDelete(id);
    res.json({ success:true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ success:false });
  }
});

// Admin event/placement management
router.post('/admin/events/:id/delete', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try { const id = req.params.id; await Event.findByIdAndDelete(id); res.json({ success:true }); } catch (err) { console.error(err); res.status(500).json({ success:false }); }
});

router.post('/admin/placements/:id/delete', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try { const id = req.params.id; await Placement.findByIdAndDelete(id); res.json({ success:true }); } catch (err) { console.error(err); res.status(500).json({ success:false }); }
});

// Admin export CSV (users)
router.get('/admin/export/users', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const users = await User.find({}).lean();
    const header = 'name,email,role,department,createdAt\n';
    const rows = users.map(u => `${(u.name||'').replace(/,/g,' ')} , ${(u.email||'')} , ${(u.role||'')} , ${(u.department||'')} , ${(u.createdAt?u.createdAt.toISOString():'')}`).join('\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="users.csv"');
    res.send(header + rows);
  } catch (err) {
    console.error('Export users error:', err);
    res.status(500).send('Error');
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

// faculty create lecture
router.post('/faculty/lectures/new', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const { title, subject, department, semester, date, startTime, endTime } = req.body;
    const lec = new Lecture({ title, subject, faculty: req.session.user.id, department, semester, date: date ? new Date(date) : undefined, startTime, endTime });
    await lec.save();
    console.log('Lecture created:', { id: lec._id, dept: lec.department, semester: lec.semester, date: lec.date });
    res.json({ success: true, lecture: lec });
  } catch (err) {
    console.error('Create lecture error:', err);
    res.status(500).json({ success: false });
  }
});

// faculty record attendance (records array)
router.post('/faculty/attendance/records', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const { date, subject, department, semester, records } = req.body; // records: [{ student, status }]
    const att = new Attendance({ date: date ? new Date(date) : new Date(), subject, department, semester, records, recordedBy: req.session.user.id });
    await att.save();
    res.json({ success: true, attendance: att });
  } catch (err) {
    console.error('Attendance records error:', err);
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

// student leave application
router.post('/api/student/leave', isAuthenticated, authorizeRoles('student'), async (req, res) => {
  try {
    const { from, to, reason } = req.body;
    const lr = new LeaveRequest({ student: req.session.user.id, from: new Date(from), to: new Date(to), reason });
    await lr.save();
    res.json({ success: true, leave: lr });
  } catch (err) {
    console.error('Leave application error:', err);
    res.status(500).json({ success: false });
  }
});

// API: student's lectures (JSON) - useful for debugging/display
router.get('/api/student/lectures', isAuthenticated, authorizeRoles('student'), async (req, res) => {
  try {
    const user = req.session.user;
    const dateQuery = req.query.date ? new Date(req.query.date) : new Date();
    const startOfDay = new Date(dateQuery); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(dateQuery); endOfDay.setHours(23,59,59,999);
    const lectures = await Lecture.find({ department: user.department, semester: user.semester, date: { $gte: startOfDay, $lte: endOfDay } }).sort({ startTime: 1 }).populate('faculty', 'name').lean();
    res.json({ success: true, filters: { department: user.department, semester: user.semester, start: startOfDay.toISOString(), end: endOfDay.toISOString() }, lectures });
  } catch (err) {
    console.error('API student lectures error:', err);
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
