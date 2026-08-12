const mongoose = require('mongoose');

const placementSchema = new mongoose.Schema({
  companyName: { type: String, required: true},
  jobRole: { type: String, required: true},
  ctc: { type: String, required: true},
  eligibility: { type: String, required: true},
  deadline: { type: Date, required: true},
  applicants: [{
    student: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    appliedAt: {type: Date, default: Date.now },
    status: {type: String, enum: ['Applied', 'Shortlisted', 'Rejected', 'Selected'], default: 'Applied'}
  }],
  createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true}
}, {timestamps: true});

module.exports = mongoose.model('Placement', placementSchema);