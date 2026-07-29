const mongoose = require("mongoose");

const BidRequestSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  grossSquareFeet: { type: Number, required: true, min: 1 },
  propertyType: {
    type: String,
    enum: ["free_standing", "strip_mall", "individual_suite"],
    required: true,
  },
  address: { type: String, required: true },
  serviceFrequency: {
    type: String,
    enum: ["monthly", "weekly", "ad_hoc"],
    required: true,
  },
  knownIssues: { type: String, default: "" },
  pricingEstimate: {
    type: {
      version: { type: Number, required: true },
      estimatedPerVisitCents: { type: Number, required: true, min: 0 },
      estimatedMonthlyCents: { type: Number, default: null, min: 0 },
      requiresManualReview: { type: Boolean, default: false },
      manualReviewReasons: [{ type: String }],
      inputs: {
        normalizedSquareFeet: Number,
        complexityModifier: Number,
        visitsPerMonth: Number,
        frequencyMultiplier: Number,
        knownIssuesProvided: Boolean,
      },
    },
    select: false,
  },
  attachmentKey: { type: String, required: true },
  attachmentName: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "approved", "declined"],
    default: "pending",
    index: true,
  },
  adminNotes: { type: String, default: "" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  archivedAt: { type: Date, default: null, index: true },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  activity: [{
    action: { type: String, enum: ["created", "approved", "declined", "archived", "restored"] },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

BidRequestSchema.index({ organizationId: 1, archivedAt: 1, createdAt: -1 });

module.exports = mongoose.model("BidRequest", BidRequestSchema);
