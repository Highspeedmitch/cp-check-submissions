const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  propertyName: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The assigned user
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true }, // 🔹 Ensure assignments belong to an organization
  startDate: { type: Date, required: true, index: true }, // 🔹 Indexed for faster queries
  endDate: { type: Date, required: true },
  eventType: { type: String, enum: ["QA Check", "Maintenance", "Cleaning"], required: false },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'canceled'], // 🔹 Defined status options
    default: 'scheduled'
  },
  notes: { type: String }, // Optional field for additional info
  oneTimeCheckRequest: { type: String, default: "" } // ✅ NEW: One-Time Additional Check Request Field
}, { timestamps: true }); // 🔹 Adds createdAt and updatedAt fields automatically

// 🔹 Ensure uniqueness for assignments within an organization (prevents duplicates)
assignmentSchema.index({ propertyName: 1, startDate: 1, organizationId: 1 }, { unique: true });
assignmentSchema.index({ organizationId: 1, userId: 1, startDate: -1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
