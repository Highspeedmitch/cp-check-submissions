// models/submission.js
const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // <-- NEW: Associate submission with a user
  property: { type: String, required: true },
  pdfUrl: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  // You can add any additional fields as needed, e.g., customFields
});

module.exports = mongoose.model('Submission', SubmissionSchema);
