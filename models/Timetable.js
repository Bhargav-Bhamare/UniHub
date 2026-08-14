const mongoose = require('mongoose');

const TimetableEntry = new mongoose.Schema({
  day: { type: String }, // e.g., Monday
  startTime: String,
  endTime: String,
  subject: String,
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  room: String
});

const TimetableSchema = new mongoose.Schema({
  department: String,
  semester: String,
  week: [TimetableEntry],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Timetable', TimetableSchema);
