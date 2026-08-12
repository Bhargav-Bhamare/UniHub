const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  assignment: {type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true},
  student: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  fileUrl: { type: String},
  gitHubUrl: {type: String},
  submittedAt: {type: Date, default: Date.now},
  status: {type: String, enum: ['On-time', 'Late'], default: 'On-time' },
  marks: {type: Number, default: null},
  feedback: {type: String, default: ''}
}, {timestamps: true });

module.exports = mongoose.model('Submission', submissionSchema);