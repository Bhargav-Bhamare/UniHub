const mongoose = require('mongoose');

const LectureSchema = new mongoose.Schema({
  title: String,
  subject: String,
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  department: String,
  semester: Number,
  date: Date,
  startTime: String,
  endTime: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Lecture', LectureSchema);
