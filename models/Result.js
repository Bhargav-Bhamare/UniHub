const mongoose = require('mongoose');

const ResultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  subject: String,
  marks: Number,
  grade: String,
  examDate: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', ResultSchema);
