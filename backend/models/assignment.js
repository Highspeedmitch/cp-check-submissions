// models/assignment.js
const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  propertyName: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // the user scheduled for the check
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  // Optionally a status field or notes
  status: { type: String, default: 'scheduled' }
});

module.exports = mongoose.model('Assignment', assignmentSchema);
