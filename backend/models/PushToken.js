const mongoose = require("mongoose");

const pushTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  token: { type: String, required: true },
  platform: { type: String, enum: ["ios", "android", "web"], required: true },
  deviceId: { type: String, default: "" },
  enabled: { type: Boolean, default: true },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

pushTokenSchema.index({ token: 1 }, { unique: true });
pushTokenSchema.index({ organizationId: 1, userId: 1, enabled: 1 });

module.exports = mongoose.model("PushToken", pushTokenSchema);
