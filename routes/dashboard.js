const express = require('express');
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require('../middleware/auth');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Event = require('../models/Event');
const Placement = require('../models/Placement');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

// Student Dashboard
router.get('/student/dashboard', isAuthenticated, authorizeRoles('student'), async (req, res) => {
  try {
    const user = req.session.user;
    // fetch a few upcoming assignments/events/placements for the student
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

    // normalize dates to simple strings for templates
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
    // get recent submissions for those assignments
    const assignmentIds = assignments.map(a => a._id);
    const submissions = await Submission.find({ assignment: { $in: assignmentIds } }).populate('student').sort({ createdAt: -1 }).limit(8).lean();
    // map submissions for simple template use
    const subs = submissions.map(s => ({ studentName: s.student && s.student.name ? s.student.name : 'Student', assignment: s.assignment.title || s.assignment, status: s.status }));
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
    // simple approvals placeholder - could be fetched from a real approvals collection
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
    const user = req.session.user;
    const usersCount = await User.countDocuments();
    const eventsCount = await Event.countDocuments();
    const placementsCount = await Placement.countDocuments();
    const recentUsers = await User.find({}).sort({ createdAt: -1 }).limit(6).lean();
    const recentEvents = await Event.find({}).sort({ eventDate: -1 }).limit(6).lean();

    res.render('dashboard/admin', { title: 'Admin Dashboard - UniHub', user, stats: { users: usersCount, events: eventsCount, placements: placementsCount }, users: recentUsers, events: recentEvents });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.render('dashboard/admin', { title: 'Admin Dashboard - UniHub', user: req.session.user });
  }
});

module.exports = router;

// POST: Submit assignment (expects JSON { assignmentId, link })
router.post('/submission', isAuthenticated, authorizeRoles('student'), async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { assignmentId, link } = req.body;
    if (!assignmentId || !link) return res.status(400).send('Missing fields');

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).send('Assignment not found');

    const status = (new Date(assignment.dueDate) < new Date()) ? 'Late' : 'On-time';

    const sub = new Submission({
      assignment: assignment._id,
      student: studentId,
      gitHubUrl: link,
      status
    });
    await sub.save();
    return res.status(200).send('Submission saved');
  } catch (err) {
    console.error('Submission error:', err);
    return res.status(500).send('Server error');
  }
});

// POST: Register for event (expects JSON { eventId })
router.post('/events/register', isAuthenticated, authorizeRoles('student'), async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { eventId } = req.body;
    if (!eventId) return res.status(400).send('Missing eventId');

    const ev = await Event.findById(eventId);
    if (!ev) return res.status(404).send('Event not found');

    if (ev.registeredStudents && ev.registeredStudents.includes(studentId)) {
      return res.status(400).send('Already registered');
    }
    ev.registeredStudents = ev.registeredStudents || [];
    ev.registeredStudents.push(studentId);
    await ev.save();
    return res.status(200).send('Registered');
  } catch (err) {
    console.error('Event register error:', err);
    return res.status(500).send('Server error');
  }
});

// POST: Apply for placement (expects JSON { placementId })
router.post('/placements/apply', isAuthenticated, authorizeRoles('student'), async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { placementId } = req.body;
    if (!placementId) return res.status(400).send('Missing placementId');

    const p = await Placement.findById(placementId);
    if (!p) return res.status(404).send('Placement not found');

    p.applicants = p.applicants || [];
    const already = p.applicants.find(a => String(a.student) === String(studentId));
    if (already) return res.status(400).send('Already applied');

    p.applicants.push({ student: studentId });
    await p.save();
    return res.status(200).send('Applied');
  } catch (err) {
    console.error('Placement apply error:', err);
    return res.status(500).send('Server error');
  }
});

// POST: Faculty - create assignment (expects JSON { title, description, subject, department, semester, dueDate })
router.post('/faculty/assignments/new', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { title, description, subject, department, semester, dueDate } = req.body;
    if (!title || !subject || !department) return res.status(400).send('Missing required fields');
    const a = new Assignment({ title, description: description || '', subject, department, semester: semester || 1, dueDate: dueDate ? new Date(dueDate) : undefined, faculty: userId });
    await a.save();
    return res.status(200).json({ ok: true, id: a._id });
  } catch (err) {
    console.error('Create assignment error:', err);
    return res.status(500).send('Server error');
  }
});

// POST: Faculty - mark attendance (expects JSON { subject, date, studentIdsPresent: [] })
router.post('/faculty/attendance', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { subject, date, studentIdsPresent, department, semester } = req.body;
    if (!subject || !department || !semester) return res.status(400).send('Missing fields');
    const records = [];
    (studentIdsPresent || []).forEach(sid => records.push({ student: sid, status: 'Present' }));
    const att = new Attendance({ subject, department, semester, date: date ? new Date(date) : new Date(), faculty: userId, records });
    await att.save();
    return res.status(200).send('Attendance saved');
  } catch (err) {
    console.error('Attendance create error:', err);
    return res.status(500).send('Server error');
  }
});

// POST: Coordinator/Admin - create event
router.post('/events/new', isAuthenticated, authorizeRoles('coordinator','admin'), async (req, res) => {
  try {
    const { title, description, venue, eventDate, registrationDeadline, totalSeats } = req.body;
    if (!title || !venue || !eventDate) return res.status(400).send('Missing fields');
    const ev = new Event({ title, description: description || '', venue, eventDate: new Date(eventDate), registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null, totalSeats: totalSeats || 0, createdBy: req.session.user.id });
    await ev.save();
    return res.status(200).json({ ok: true, id: ev._id });
  } catch (err) {
    console.error('Create event error:', err);
    return res.status(500).send('Server error');
  }
});

// POST: Admin - create placement
router.post('/placements/new', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const { companyName, jobRole, ctc, eligibility, deadline } = req.body;
    if (!companyName || !jobRole) return res.status(400).send('Missing fields');
    const p = new Placement({ companyName, jobRole, ctc: ctc || '', eligibility: eligibility || '', deadline: deadline ? new Date(deadline) : null, createdBy: req.session.user.id });
    await p.save();
    return res.status(200).json({ ok: true, id: p._id });
  } catch (err) {
    console.error('Create placement error:', err);
    return res.status(500).send('Server error');
  }
});