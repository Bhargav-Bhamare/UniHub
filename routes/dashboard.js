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
// Notification model is already imported above

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

    // today's lectures (handle semester stored as number or string in DB)
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);
    const dept = user.department ? String(user.department).trim() : user.department;
    const semCandidates = [];
    if(typeof user.semester !== 'undefined' && user.semester !== null){ semCandidates.push(user.semester); const n = Number(user.semester); if(!semCandidates.includes(n)) semCandidates.push(n); }
    const lectureQuery = { department: dept, date: { $gte: startOfDay, $lte: endOfDay } };
    if(semCandidates.length) lectureQuery.semester = { $in: semCandidates };
    const lectures = await Lecture.find(lectureQuery).sort({ startTime: 1 }).populate('faculty', 'name').lean();

    // fees summary
    const fee = await Fee.findOne({ student: user.id }).lean();

    // recent results
    const results = await Result.find({ student: user.id }).sort({ examDate: -1 }).limit(8).lean();

    // timetable for week
    const timetable = await Timetable.findOne({ department: user.department, semester: user.semester }).lean();

    // announcements (fall back to notifications)
    const announcements = await Notification.find({ $or: [{ department: user.department }, { user: user.id }, { type: 'announcement' }] }).sort({ createdAt: -1 }).limit(8).lean();

    // subjects from assignments and lectures
    const assignSubjects = await Assignment.distinct('subject', { department: user.department });
    const lectureSubjects = await Lecture.distinct('subject', { department: user.department });
    const subjects = Array.from(new Set([...(assignSubjects || []), ...(lectureSubjects || [])])).filter(Boolean);

    // upcoming events
    const upcomingEvents = await Event.find({ eventDate: { $gte: new Date() } }).sort({ eventDate: 1 }).limit(8).lean();

    res.render('dashboard/student', { title: 'Student Dashboard - UniHub', user, assignments, events: upcomingEvents, placements, attendance, lectures, fee, results, timetable, announcements, subjects });
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
    // upcoming lectures and subjects for faculty
    const now = new Date();
    const weekAhead = new Date(); weekAhead.setDate(now.getDate() + 7);
    const upcomingLectures = await Lecture.find({ faculty: user.id, date: { $gte: now, $lte: weekAhead } }).sort({ date: 1, startTime: 1 }).lean();
    const subjects = await Assignment.distinct('subject', { faculty: user.id });
    const upcomingEvents = await Event.find({ eventDate: { $gte: new Date() } }).sort({ eventDate: 1 }).limit(6).lean();

    res.render('dashboard/faculty', { title: 'Faculty Dashboard - UniHub', user, assignments, submissions: subs, upcomingLectures, subjects, upcomingEvents });
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

// Faculty: lectures listing page
router.get('/faculty/lectures', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const user = req.session.user;
    // show all lectures for this faculty (past and upcoming)
    const lectures = await Lecture.find({ faculty: user.id }).sort({ date: -1 }).lean();
    const assignments = await Assignment.find({ faculty: user.id }).sort({ createdAt: -1 }).lean();
    const submissions = [];
    res.render('dashboard/faculty', { title: 'My Lectures - UniHub', user, assignments, submissions, upcomingLectures: lectures, subjects: [] , upcomingEvents: [] });
  } catch (err) {
    console.error('Faculty lectures page error:', err);
    res.status(500).send('Server error');
  }
});

// Faculty: view submissions for a specific assignment
router.get('/faculty/assignments/:id/submissions', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const user = req.session.user;
    const assignmentId = req.params.id;
    const assignments = await Assignment.find({ faculty: user.id }).sort({ createdAt: -1 }).lean();
    const submissions = await Submission.find({ assignment: assignmentId }).populate('student').sort({ createdAt: -1 }).lean();
    // normalize submissions for the template
    const subs = submissions.map(s => ({ studentName: s.student && s.student.name ? s.student.name : 'Student', assignment: (s.assignment && s.assignment.title) ? s.assignment.title : String(s.assignment), status: s.status }));
    res.render('dashboard/faculty', { title: 'Assignment Submissions - UniHub', user, assignments, submissions: subs });
  } catch (err) {
    console.error('Assignment submissions page error:', err);
    res.status(500).send('Server error');
  }
});

// Coordinator Dashboard
router.get('/coordinator/dashboard', isAuthenticated, authorizeRoles('coordinator'), async (req, res) => {
  try {
    const user = req.session.user;
    const events = await Event.find({}).sort({ eventDate: 1 }).limit(8).lean();
    const approvals = [{ id: 1, type: 'Event', title: 'Hackathon', requester: 'Prof. Sharma' }];
    // additional coordinator overview: subjects, upcoming lectures, recent assignments
    const assignSubjects = await Assignment.distinct('subject', { department: user.department });
    const lectureSubjects = await Lecture.distinct('subject', { department: user.department });
    const subjects = Array.from(new Set([...(assignSubjects || []), ...(lectureSubjects || [])])).filter(Boolean);
    const now = new Date();
    const weekAhead = new Date(); weekAhead.setDate(now.getDate() + 7);
    const upcomingLectures = await Lecture.find({ department: user.department, date: { $gte: now, $lte: weekAhead } }).sort({ date: 1 }).populate('faculty','name').lean();
    const recentAssignments = await Assignment.find({ department: user.department }).sort({ createdAt: -1 }).limit(12).lean();
    res.render('dashboard/coordinator', { title: 'Coordinator Dashboard - UniHub', user, events, approvals, subjects, upcomingLectures, recentAssignments });
  } catch (err) {
    console.error('Coordinator dashboard error:', err);
    res.render('dashboard/coordinator', { title: 'Coordinator Dashboard - UniHub', user: req.session.user });
  }
});

// Coordinator: list pending requests (events, leave)
router.get('/coordinator/requests', isAuthenticated, authorizeRoles('coordinator'), async (req, res) => {
  try {
    const pendingEvents = await Event.find({ status: 'pending' }).populate('requestedBy','name email').sort({ createdAt: -1 }).lean();
    const pendingLeaves = await LeaveRequest.find({ status: 'pending' }).populate('student','name email department rollNumber').sort({ appliedAt: -1 }).lean();
    res.json({ success: true, pendingEvents, pendingLeaves });
  } catch (err) {
    console.error('Coordinator requests error:', err);
    res.status(500).json({ success: false });
  }
});

// Coordinator: events management view
router.get('/coordinator/events', isAuthenticated, authorizeRoles('coordinator'), async (req, res) => {
  try {
    const user = req.session.user;
    const events = await Event.find({}).sort({ eventDate: 1 }).populate('assignedFaculty','name').lean();
    const faculty = await User.find({ role: 'faculty' }).select('name email department').lean();
    const pendingEvents = await Event.find({ status: 'pending' }).populate('requestedBy','name email').sort({ createdAt: -1 }).lean();
    const pendingLeaves = await LeaveRequest.find({ status: 'pending' }).populate('student','name email department rollNumber').sort({ appliedAt: -1 }).lean();
    res.render('dashboard/coordinator', { title: 'Manage Events - Coordinator', user, events, approvals: pendingEvents, faculty, pendingLeaves });
  } catch (err) {
    console.error('Coordinator events page error:', err);
    res.status(500).send('Server error');
  }
});

// Approve / reject event requests
router.post('/coordinator/events/:id/approve', isAuthenticated, authorizeRoles('coordinator'), async (req, res) => {
  try {
    const id = req.params.id;
    await Event.findByIdAndUpdate(id, { status: 'approved' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ success:false }); }
});
router.post('/coordinator/events/:id/reject', isAuthenticated, authorizeRoles('coordinator'), async (req, res) => {
  try { const id = req.params.id; await Event.findByIdAndUpdate(id, { status: 'rejected' }); res.json({ success:true }); } catch(err){ console.error(err); res.status(500).json({ success:false }); }
});

// Assign faculty to event
router.post('/coordinator/events/:id/assign', isAuthenticated, authorizeRoles('coordinator'), async (req, res) => {
  try {
    const id = req.params.id;
    const { facultyId } = req.body;
    await Event.findByIdAndUpdate(id, { assignedFaculty: facultyId });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ success:false }); }
});

// Approve / reject leave requests
router.post('/coordinator/leave/:id/approve', isAuthenticated, authorizeRoles('coordinator'), async (req, res) => {
  try {
    const id = req.params.id;
    const lr = await LeaveRequest.findByIdAndUpdate(id, { status: 'approved' }, { new: true }).lean();
    if(lr){
      // notify student
      try{ await Notification.create({ recipient: lr.student, title: 'Leave Approved', message: `Your leave from ${lr.from ? new Date(lr.from).toISOString().slice(0,10) : ''} has been approved.`, type: 'System' }); }catch(e){console.error('Notify student leave approved', e)}
    }
    res.json({ success:true });
  } catch(err){ console.error(err); res.status(500).json({ success:false }); }
});
router.post('/coordinator/leave/:id/reject', isAuthenticated, authorizeRoles('coordinator'), async (req, res) => {
  try {
    const id = req.params.id;
    const lr = await LeaveRequest.findByIdAndUpdate(id, { status: 'rejected' }, { new: true }).lean();
    if(lr){
      try{ await Notification.create({ recipient: lr.student, title: 'Leave Rejected', message: `Your leave from ${lr.from ? new Date(lr.from).toISOString().slice(0,10) : ''} has been rejected.`, type: 'System' }); }catch(e){console.error('Notify student leave rejected', e)}
    }
    res.json({ success:true });
  } catch(err){ console.error(err); res.status(500).json({ success:false }); }
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
    // additional admin overview data
    const subjects = await Assignment.distinct('subject');
    const recentLectures = await Lecture.find({}).sort({ date: -1 }).limit(12).populate('faculty','name').lean();
    const pendingEventsCount = await Event.countDocuments({ status: 'pending' });
    const pendingLeavesCount = await LeaveRequest.countDocuments({ status: 'pending' });

    res.render('dashboard/admin', { title: 'Admin Dashboard', placements, events, users, stats, user: req.session.user, subjects, recentLectures, pendingEventsCount, pendingLeavesCount });
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

// Admin: seed random students view
router.get('/admin/seed-students', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    res.render('admin/seed-students', { title: 'Seed Students', user: req.session.user });
  } catch (err) { console.error('Seed students page error', err); res.status(500).send('Server error'); }
});

// Admin: POST seed students
router.post('/admin/seed-students', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const { count = 10, department = 'Computer Science', semester = 1 } = req.body;
    const c = Math.min(200, parseInt(count, 10) || 10);
    const first = ['Aarav','Vivaan','Aditya','Arjun','Vihaan','Ishaan','Sai','Rohan','Karan','Rahul','Ananya','Priya','Saanvi','Isha','Aditi','Kavya','Tara','Maya','Neha','Simran'];
    const last = ['Shah','Kumar','Patel','Rao','Singh','Verma','Mehta','Gupta','Joshi','Nair','Iyer','Bose','Chopra','Kapoor','Saxena'];
    const created = [];
    for(let i=0;i<c;i++){
      const name = `${first[Math.floor(Math.random()*first.length)]} ${last[Math.floor(Math.random()*last.length)]}`;
      const ts = Date.now().toString().slice(-6) + Math.floor(Math.random()*900).toString();
      const email = `${name.toLowerCase().replace(/\s+/g,'.')}.${ts}@example.com`;
      const roll = `${(department||'DEPT').replace(/\s+/g,'').slice(0,4).toUpperCase()}${String(semester)}${Math.floor(1000+Math.random()*8999)}`;
      const pwd = 'student123';
      const hashed = await bcrypt.hash(pwd, 10);
      const u = new User({ name, email, password: hashed, role: 'student', department, semester, rollNumber: roll });
      await u.save();
      created.push({ _id: u._id, name: u.name, email: u.email, tempPassword: pwd });
    }
    res.json({ success: true, created });
  } catch (err) { console.error('Seed students error', err); res.status(500).json({ success:false, message: String(err) }); }
});

// Admin: attendance test page (renders sample students)
router.get('/admin/attendance-test', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).sort({ name: 1 }).limit(20).lean();
    res.render('admin/attendance-test', { title: 'Attendance Test', students, user: req.session.user });
  } catch (err) { console.error('Attendance test page error', err); res.status(500).send('Server error'); }
});

// Admin: save attendance from test page
router.post('/admin/attendance-test/save', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const { records } = req.body; // [{ student, status }]
    if(!Array.isArray(records)) return res.status(400).json({ success:false, message:'invalid records' });
    const docs = records.map(r => ({ date: new Date(), student: r.student, status: r.status || 'Absent', recordedBy: req.session.user.id }));
    await Attendance.insertMany(docs);
    res.json({ success:true });
  } catch (err) { console.error('Save attendance test error', err); res.status(500).json({ success:false }); }
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

// Notifications: unread for current user (or broadcasts)
router.get('/api/notifications/unread', isAuthenticated, async (req, res) => {
  try {
    const uid = req.session.user.id;
    const notes = await Notification.find({ $or: [ { recipient: uid }, { recipient: null } ], isRead: false }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, notifications: notes });
  } catch (err) {
    console.error('Unread notifications error:', err);
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
    const { title, description, subject, dueDate, department, semester } = req.body;
    const assignment = new Assignment({ title, description, subject, dueDate: dueDate ? new Date(dueDate) : undefined, department, semester, faculty: req.session.user.id });
    await assignment.save();
    // notify students in same department+semester
    try{
      const students = await User.find({ role: 'student', department: department, semester: semester }).select('_id').lean();
      const notes = students.map(s => ({ recipient: s._id, title: 'New Assignment: ' + assignment.title, message: `A new assignment "${assignment.title}" for ${assignment.subject} was posted.`, type: 'Assignment' }));
      if(notes.length) await Notification.insertMany(notes);
    }catch(nerr){ console.error('Notify students assignment error:', nerr); }
    // also create coordinator-level notification (broadcast null recipient)
    try{ await Notification.create({ recipient: null, title: 'Assignment Posted', message: `${assignment.title} posted by ${req.session.user.name}`, type: 'Assignment' }); }catch(e){console.error(e)}
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
    const lec = new Lecture({ title, subject, faculty: req.session.user.id, department: department ? String(department).trim() : department, semester: semester ? parseInt(semester,10) : semester, date: date ? new Date(date) : undefined, startTime, endTime });
    await lec.save();
    console.log('Lecture created:', { id: lec._id, dept: lec.department, semester: lec.semester, date: lec.date });
    // notify students in that dept+semester
    try{
      // normalize department/semester matching (students may have numeric semester)
      const dept = department ? String(department).trim() : department;
      const semNum = semester ? parseInt(semester,10) : null;
      const students = await User.find({ role: 'student', department: dept, semester: semNum != null ? semNum : semester }).select('_id').lean();
      const notes = students.map(s => ({ recipient: s._id, title: 'New Lecture: ' + lec.subject, message: `A new lecture on ${lec.subject} titled "${lec.title}" has been scheduled.`, type: 'Event' }));
      if(notes.length) await Notification.insertMany(notes);
    }catch(nerr){ console.error('Notify students lecture error:', nerr); }

    // coordinator broadcast
    try{ await Notification.create({ recipient: null, title: 'Lecture Scheduled', message: `${lec.title} scheduled by ${req.session.user.name}`, type: 'Event' }); }catch(e){console.error(e)}

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

// Get students for a lecture (limit 10) - returns student list for lecture's department/semester
router.get('/faculty/lectures/:id/students', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const id = req.params.id;
    const lec = await Lecture.findById(id).lean();
    if(!lec) return res.status(404).json({ success:false });
    const dept = lec.department ? String(lec.department).trim() : lec.department;
    const semCandidates = [];
    if(typeof lec.semester !== 'undefined' && lec.semester !== null){ semCandidates.push(lec.semester); const n = Number(lec.semester); if(!semCandidates.includes(n)) semCandidates.push(n); }
    const q = { role: 'student', department: dept };
    if(semCandidates.length) q.semester = { $in: semCandidates };
    const students = await User.find(q).select('_id name rollNumber').sort({ name:1 }).limit(10).lean();
    res.json({ success:true, students });
  } catch (err) { console.error(err); res.status(500).json({ success:false }); }
});

// Mark attendance for a lecture with records [{ student, status }]
router.post('/faculty/lectures/:id/attendance', isAuthenticated, authorizeRoles('faculty'), async (req, res) => {
  try {
    const id = req.params.id;
    const { records } = req.body; // array
    if(!Array.isArray(records)) return res.status(400).json({ success:false });
    const docs = records.map(r => ({ date: new Date(), subject: r.subject || '', department: r.department || '', semester: r.semester || '', student: r.student, status: r.status, lecture: id, recordedBy: req.session.user.id }));
    await Attendance.insertMany(docs);
    res.json({ success:true });
  } catch (err) { console.error(err); res.status(500).json({ success:false }); }
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
    const e = new Event({ title, description, eventDate, location, createdBy: req.session.user.id, status: 'approved' });
    await e.save();
    // notify all students about new event
    try{
      const students = await User.find({ role: 'student' }).select('_id').lean();
      const notes = students.map(s => ({ recipient: s._id, title: 'New Event: ' + e.title, message: `A new event "${e.title}" was added.`, type: 'Event' }));
      if(notes.length) await Notification.insertMany(notes);
    }catch(nerr){ console.error('Notify students error:', nerr); }
    res.json({ success: true, event: e });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// Propose an event (students/faculty) -> creates pending event for coordinator approval
router.post('/events/propose', isAuthenticated, authorizeRoles('faculty','student'), async (req, res) => {
  try {
    const { title, description, eventDate, location } = req.body;
    const e = new Event({ title, description, eventDate, location, createdBy: req.session.user.id, status: 'pending', requestedBy: req.session.user.id });
    await e.save();
    res.json({ success: true, event: e });
  } catch (err) {
    console.error('Propose event error:', err);
    res.status(500).json({ success: false });
  }
});


// placements
router.post('/placements/new', isAuthenticated, authorizeRoles('admin'), async (req, res) => {
  try {
    const { company, role, description } = req.body;
    const p = new Placement({ company, role, description, createdBy: req.session.user.id });
    await p.save();
    // notify students about new placement
    try{
      const students = await User.find({ role: 'student' }).select('_id').lean();
      const notes = students.map(s => ({ recipient: s._id, title: 'New Placement: ' + p.company, message: `A new placement for ${p.role} at ${p.company} was added.`, type: 'Placement' }));
      if(notes.length) await Notification.insertMany(notes);
    }catch(nerr){ console.error('Notify students about placement error:', nerr); }
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
    await Notification.findByIdAndUpdate(id, { isRead: true });
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

// Utility: seed sample fee and results for current student (for testing)
router.post('/api/seed/sample-data', isAuthenticated, async (req, res) => {
  try {
    const uid = req.session.user.id;
    const user = await User.findById(uid).lean();
    if(!user || user.role !== 'student') return res.status(403).json({ success:false, message:'Only students' });
    // create fee if missing
    let fee = await Fee.findOne({ student: uid }).lean();
    if(!fee){ const f = new Fee({ student: uid, total: 50000, paid: 20000, dueDate: new Date(Date.now()+30*24*3600*1000), status: 'partial' }); await f.save(); fee = f.toObject(); }
    // create two sample results
    const existing = await Result.find({ student: uid }).limit(1).lean();
    if(!existing || existing.length===0){
      const r1 = new Result({ student: uid, subject: 'DBMS', marks: 78, grade: 'B+', examDate: new Date(Date.now()-20*24*3600*1000) });
      const r2 = new Result({ student: uid, subject: 'OS', marks: 85, grade: 'A', examDate: new Date(Date.now()-40*24*3600*1000) });
      await r1.save(); await r2.save();
    }
    res.json({ success:true, fee });
  } catch (err) { console.error('Seed sample data error', err); res.status(500).json({ success:false }); }
});

module.exports = router;
