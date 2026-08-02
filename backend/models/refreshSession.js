const mongoose = require("mongoose");

const RefreshSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  tokenVersion: { type: Number, required: true, default: 0 },
  accountScope: {
    type: String,
    enum: ["organization", "afterlight_resource"],
    default: null,
  },
  expiresAt: { type: Date, required: true },
  lastUsedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null, index: true },
  replacedByHash: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  ipAddress: { type: String, default: "" },
  mfaAuthenticatedAt: { type: Date, default: null },
}, { timestamps: true });

RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RefreshSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

module.exports = mongoose.model("RefreshSession", RefreshSessionSchema);
