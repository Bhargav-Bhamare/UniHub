const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  subject: { type: String, required: true },
  department: { type: String, required: true },
  semester: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attachmentUrl: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Assignment', assignmentSchema);