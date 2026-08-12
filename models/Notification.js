const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Leave null for broadcast/all
  title: {type: String, required: true},
  message: {type: String, required: true},
  type: {type: String, enum: ['Assignment', 'Attendance', 'Event', 'Placement', 'System'], default: 'System' },
  isRead: {type: Boolean, default: false}
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);