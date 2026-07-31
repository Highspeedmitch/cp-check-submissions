const mongoose = require("mongoose");

const PlatformAuditSchema = new mongoose.Schema({
  actorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  action: { type: String, required: true, index: true },
  targetOrganizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    default: null,
    index: true,
  },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, default: "" },
  userAgent: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("PlatformAudit", PlatformAuditSchema);
