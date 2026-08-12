const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['student', 'faculty', 'coordinator', 'admin'], 
    default: 'student' 
  },
  isVerified: { type: Boolean, default: false },
  
  // Role-Specific Optional Details
  rollNumber: { type: String, trim: true },
  department: { type: String, trim: true },
  semester: { type: Number },
  phone: { type: String, trim: true },
  skills: [{ type: String }],
  linkedIn: { type: String, trim: true },
  gitHub: { type: String, trim: true },
  resumeUrl: { type: String, trim: true },
  bio: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);