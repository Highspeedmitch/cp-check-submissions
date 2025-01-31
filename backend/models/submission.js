// models/submission.js
const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  property: { type: String, required: true },
  pdfUrl: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  // Add any additional fields as needed
});

module.exports = mongoose.model('Submission', SubmissionSchema);
