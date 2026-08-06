const mongoose = require("mongoose");

const MfaChallengeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  tokenHash: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ["login", "enrollment", "step_up"], required: true },
  pendingSecretEncrypted: { type: String, default: "", select: false },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

MfaChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("MfaChallenge", MfaChallengeSchema);
