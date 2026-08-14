const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  from: Date,
  to: Date,
  reason: String,
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  appliedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LeaveRequest', LeaveSchema);
