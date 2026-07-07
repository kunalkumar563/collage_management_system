const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  time: { type: String, required: true }, // e.g. "09:00 AM"
  room: { type: String, required: true },
  type: { type: String, required: true }, // e.g. "Lecture", "Practical"
  color: { type: String, default: '#6366F1' },
  department: { type: String, required: true },
  attendance: { type: Number, default: 0 }, // optional for UI mock usage
}, { timestamps: true });

module.exports = mongoose.model('Subject', subjectSchema);
