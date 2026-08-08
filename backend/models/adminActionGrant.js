const mongoose = require("mongoose");

const AdminActionGrantSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  purpose: {
    type: String,
    enum: ["add_property", "remove_property", "update_fulfillment_policy", "invite_admin", "remove_admin", "bulk_onboarding"],
    required: true,
  },
  passkeyVersion: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

AdminActionGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AdminActionGrant", AdminActionGrantSchema);
