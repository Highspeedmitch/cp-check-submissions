const mongoose = require("mongoose");

const ResourceProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: undefined,
  },
  invitationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrganizationInvitation",
    default: null,
  },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  displayName: { type: String, required: true, trim: true },
  resourceType: {
    type: String,
    enum: ["contractor", "employee", "owner"],
    default: "contractor",
    index: true,
  },
  owner: { type: String, enum: ["afterlight"], default: "afterlight" },
  status: {
    type: String,
    enum: ["invited", "onboarding", "active", "suspended"],
    default: "invited",
    index: true,
  },
  availabilityStatus: {
    type: String,
    enum: ["available", "unavailable"],
    default: "available",
    index: true,
  },
  skills: { type: [String], default: [] },
  regions: { type: [String], default: [] },
  defaultRateCents: { type: Number, min: 0, default: 0 },
  currency: { type: String, enum: ["USD"], default: "USD" },
  gusto: {
    contractorUuid: { type: String, default: "", trim: true },
    onboardingStatus: {
      type: String,
      enum: ["not_started", "self_onboarding_invited", "self_onboarding_started", "self_onboarding_review", "onboarding_completed"],
      default: "not_started",
    },
    lastSyncedAt: { type: Date, default: null },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  archivedAt: { type: Date, default: null, index: true },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  archiveReason: { type: String, default: "", trim: true, maxlength: 500 },
}, { timestamps: true });

ResourceProfileSchema.index({ status: 1, availabilityStatus: 1, displayName: 1 });
ResourceProfileSchema.index({ archivedAt: 1, displayName: 1 });
ResourceProfileSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } }
);

module.exports = mongoose.model("ResourceProfile", ResourceProfileSchema);
