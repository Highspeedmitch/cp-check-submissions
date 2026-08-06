const mongoose = require("mongoose");

const SERVICE_MODELS = ["platform", "managed", "hybrid"];
const CHANGE_TYPES = ["service_model", "license_tier", "custom_capacity"];
const LICENSE_TIERS = ["tier_1", "tier_2", "tier_3"];
const ACTIVE_STATUSES = ["pending_review", "information_requested"];

const messageSchema = new mongoose.Schema({
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actorScope: { type: String, enum: ["organization_admin", "platform_admin"], required: true },
  message: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const serviceModelChangeRequestSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  changeType: { type: String, enum: CHANGE_TYPES, default: "service_model", index: true },
  currentServiceModel: { type: String, enum: SERVICE_MODELS, required: true },
  requestedServiceModel: { type: String, enum: SERVICE_MODELS, required: true },
  currentLicenseTier: { type: String, enum: [...LICENSE_TIERS, null], default: null },
  requestedLicenseTier: { type: String, enum: [...LICENSE_TIERS, null], default: null },
  reason: { type: String, required: true, maxlength: 2000 },
  proposedEffectiveDate: { type: Date, default: null },
  status: {
    type: String,
    enum: ["pending_review", "information_requested", "approved", "denied", "canceled"],
    default: "pending_review",
    index: true,
  },
  organizationSnapshot: {
    propertyCount: { type: Number, min: 0, default: 0 },
    propertyOverrideCount: { type: Number, min: 0, default: 0 },
    defaultFulfillmentSource: { type: String, default: "" },
    policyVersion: { type: Number, min: 1, default: 1 },
    currentAdminLimit: { type: Number, min: 0, default: null },
    currentUserLimit: { type: Number, min: 0, default: null },
    currentPropertyLimit: { type: Number, min: 0, default: null },
    requestedAdminLimit: { type: Number, min: 0, default: null },
    requestedUserLimit: { type: Number, min: 0, default: null },
    requestedPropertyLimit: { type: Number, min: 0, default: null },
    currentAfterlightPortfolioMinimumPercent: { type: Number, min: 0, max: 100, default: null },
    requestedAfterlightPortfolioMinimumPercent: { type: Number, min: 0, max: 100, default: null },
    activeAdministratorCount: { type: Number, min: 0, default: 0 },
    pendingAdministratorCount: { type: Number, min: 0, default: 0 },
    activeUserCount: { type: Number, min: 0, default: 0 },
    pendingUserCount: { type: Number, min: 0, default: 0 },
  },
  messages: { type: [messageSchema], default: [] },
  platformResponse: { type: String, default: "", maxlength: 2000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  appliedAt: { type: Date, default: null },
  notification: {
    platformEmailSentAt: { type: Date, default: null },
    platformEmailError: { type: String, default: "", maxlength: 500 },
    requesterEmailSentAt: { type: Date, default: null },
    requesterEmailError: { type: String, default: "", maxlength: 500 },
  },
}, { timestamps: true });

serviceModelChangeRequestSchema.index({ organizationId: 1, createdAt: -1 });
serviceModelChangeRequestSchema.index({ status: 1, createdAt: -1 });

const ServiceModelChangeRequest = mongoose.model("ServiceModelChangeRequest", serviceModelChangeRequestSchema);

module.exports = ServiceModelChangeRequest;
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports.SERVICE_MODELS = SERVICE_MODELS;
module.exports.CHANGE_TYPES = CHANGE_TYPES;
module.exports.LICENSE_TIERS = LICENSE_TIERS;
