// models/submission.js
const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // <-- NEW: Associate submission with a user
  property: { type: String, required: true },
  pdfUrl: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  responses: { type: mongoose.Schema.Types.Mixed, default: {} },
  templateSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", default: null },
  fulfillmentSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  processingJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InspectionJob",
    default: undefined,
  },
});

SubmissionSchema.index({ organizationId: 1, property: 1, submittedAt: -1 });
SubmissionSchema.index({ organizationId: 1, userId: 1, submittedAt: -1 });
SubmissionSchema.index({ organizationId: 1, submittedAt: -1 });
SubmissionSchema.index({ processingJobId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Submission', SubmissionSchema);
