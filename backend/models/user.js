// models/user.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
  role: { type: String, enum: ["admin", "property_manager", "user", "client", "contractor", "cleaner"], default: "user" },
  platformRole: {
    type: String,
    enum: ["platform_admin"],
    default: null,
    index: true,
  },
  oktaSubject: { type: String, default: "", index: true },
  mfa: {
    totpEnabled: { type: Boolean, default: false },
    totpSecretEncrypted: { type: String, default: "", select: false },
    enrolledAt: { type: Date, default: null },
    lastVerifiedAt: { type: Date, default: null },
    lastUsedCounter: { type: Number, default: null },
    recoveryCodeHashes: { type: [String], default: [], select: false },
  },
  accountStatus: { type: String, enum: ["active", "inactive"], default: "active", index: true },
  tokenVersion: { type: Number, default: 0 },
  lastPaidDate: { type: Date, default: null },
  paymentStatus: { type: String, enum: ["Awaiting Payment", "Paid"], default: "Awaiting Payment" },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
});

module.exports = mongoose.model("User", UserSchema);
