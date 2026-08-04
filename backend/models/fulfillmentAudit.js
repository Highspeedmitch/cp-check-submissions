const mongoose = require("mongoose");

const FulfillmentAuditSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true, immutable: true },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  entityType: { type: String, enum: ["organization", "property", "assignment"], required: true, immutable: true },
  entityId: { type: String, required: true, immutable: true },
  action: { type: String, required: true, immutable: true },
  previousValue: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  nextValue: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  reason: { type: String, default: "", immutable: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
  ipAddress: { type: String, default: "", immutable: true },
  userAgent: { type: String, default: "", immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
});

FulfillmentAuditSchema.index({ organizationId: 1, createdAt: -1 });
FulfillmentAuditSchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model("FulfillmentAudit", FulfillmentAuditSchema);
