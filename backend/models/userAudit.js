const mongoose = require("mongoose");

const UserAuditSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  changes: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model("UserAudit", UserAuditSchema);
