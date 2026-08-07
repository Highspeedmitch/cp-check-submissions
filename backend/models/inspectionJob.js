const mongoose = require("mongoose");
const { createInspectionAiSummarySchema } = require("./schemas/inspectionAiSummary");

const PhotoUploadSchema = new mongoose.Schema({
  uploadId: { type: String, required: true },
  fieldName: { type: String, required: true },
  originalName: { type: String, default: "photo" },
  key: { type: String, required: true },
  contentType: { type: String, default: "" },
  size: { type: Number, default: 0 },
}, { _id: false });

const InspectionJobSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  propertyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assignment",
    default: null,
    index: true,
  },
  propertyName: { type: String, required: true },
  orgType: { type: String, enum: ["COM", "LTR", "RES", "STR"], required: true },
  idempotencyKey: { type: String, required: true },
  submissionData: { type: mongoose.Schema.Types.Mixed, required: true },
  templateSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  aiSummary: {
    type: createInspectionAiSummarySchema(),
    default: () => ({ status: "not_requested", mode: "off" }),
  },
  photoUploads: { type: [PhotoUploadSchema], default: [] },
  status: {
    type: String,
    enum: ["uploading", "queued", "processing", "completed", "failed"],
    default: "uploading",
    index: true,
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  availableAt: { type: Date, default: Date.now, index: true },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: String, default: "" },
  lastError: { type: String, default: "" },
  submissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Submission",
    default: null,
  },
  pdfKey: { type: String, default: "" },
  pdfUrl: { type: String, default: "" },
  pdfFileName: { type: String, default: "" },
  emailSentAt: { type: Date, default: null },
  emailError: { type: String, default: "" },
  notificationsSentAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  uploadExpiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
}, { timestamps: true });

InspectionJobSchema.index(
  { organizationId: 1, userId: 1, idempotencyKey: 1 },
  { unique: true }
);
InspectionJobSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
InspectionJobSchema.index({ status: 1, lockedAt: 1 });

module.exports = mongoose.model("InspectionJob", InspectionJobSchema);
