const mongoose = require("mongoose");

const SERVICE_MODELS = ["platform", "managed", "hybrid"];
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
  currentServiceModel: { type: String, enum: SERVICE_MODELS, required: true },
  requestedServiceModel: { type: String, enum: SERVICE_MODELS, required: true },
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
