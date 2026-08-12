const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  department: { type: String, required: true },
  semester: { type: Number, required: true },
  date: { type: Date, required: true, default: Date.now },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  records: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['Present', 'Absent'], required: true }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);