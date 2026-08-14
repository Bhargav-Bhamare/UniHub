const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true},
  venue: { type: String, required: true},
  eventDate: { type: Date, required: true},
  registrationDeadline: { type: Date, required: true},
  totalSeats: { type: Number, required: true },
  registeredStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
  bannerUrl: {type: String},
  createdBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true}
  ,
  status: { type: String, enum: ['pending','approved','rejected'], default: 'approved' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedFaculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true});

module.exports = mongoose.model('Event', eventSchema);