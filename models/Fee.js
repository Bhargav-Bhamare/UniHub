const mongoose = require('mongoose');

const FeeSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  total: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  dueDate: Date,
  status: { type: String, enum: ['paid','partial','due'], default: 'due' },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Fee', FeeSchema);
