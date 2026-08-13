const mongoose = require("mongoose");

const PropertySnapshotSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true, maxlength: 240 },
}, { _id: false });

const NarrativeSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["not_requested", "generated", "fallback"],
    default: "not_requested",
  },
  executiveSummary: { type: String, default: "", maxlength: 1400 },
  highlights: { type: [String], default: [] },
  attentionAreas: { type: [String], default: [] },
  disclaimer: { type: String, default: "", maxlength: 300 },
  modelId: { type: String, default: "", maxlength: 250 },
  promptVersion: { type: String, default: "", maxlength: 80 },
  sourceHash: { type: String, default: "", maxlength: 64 },
  inputTokens: { type: Number, default: 0, min: 0 },
  outputTokens: { type: Number, default: 0, min: 0 },
  latencyMs: { type: Number, default: 0, min: 0 },
  generatedAt: { type: Date, default: null },
  lastError: { type: String, default: "", maxlength: 500 },
}, { _id: false });

const MonthlyPortfolioSummarySchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  recipientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  recipientSnapshot: {
    name: { type: String, required: true, maxlength: 180 },
    email: { type: String, required: true, maxlength: 320 },
    role: { type: String, enum: ["admin", "property_manager"], required: true },
  },
  organizationName: { type: String, required: true, maxlength: 240 },
  reportingTimezone: { type: String, required: true, maxlength: 100 },
  periodKey: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  periodLabel: { type: String, required: true, maxlength: 80 },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  propertySnapshots: { type: [PropertySnapshotSchema], default: [] },
  mode: {
    type: String,
    enum: ["preview", "live"],
    required: true,
  },
  status: {
    type: String,
    enum: ["queued", "processing", "completed", "failed"],
    default: "queued",
    index: true,
  },
  metrics: { type: mongoose.Schema.Types.Mixed, default: null },
  previousMetrics: { type: mongoose.Schema.Types.Mixed, default: null },
  comparison: { type: mongoose.Schema.Types.Mixed, default: null },
  narrative: { type: NarrativeSchema, default: () => ({}) },
  pdfKey: { type: String, default: "", maxlength: 1024 },
  pdfUrl: { type: String, default: "", maxlength: 2048 },
  pdfFileName: { type: String, default: "", maxlength: 300 },
  emailSentAt: { type: Date, default: null },
  emailError: { type: String, default: "", maxlength: 500 },
  notificationSentAt: { type: Date, default: null },
  attempts: { type: Number, default: 0, min: 0 },
  maxAttempts: { type: Number, default: 3, min: 1, max: 10 },
  availableAt: { type: Date, default: Date.now, index: true },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: String, default: "", maxlength: 240 },
  lastError: { type: String, default: "", maxlength: 500 },
  completedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
}, { timestamps: true });

MonthlyPortfolioSummarySchema.index(
  { organizationId: 1, recipientUserId: 1, periodKey: 1 },
  { unique: true }
);
MonthlyPortfolioSummarySchema.index({ status: 1, availableAt: 1, createdAt: 1 });
MonthlyPortfolioSummarySchema.index({ status: 1, lockedAt: 1 });
MonthlyPortfolioSummarySchema.index({ failedAt: 1 });

module.exports = mongoose.model("MonthlyPortfolioSummary", MonthlyPortfolioSummarySchema);
