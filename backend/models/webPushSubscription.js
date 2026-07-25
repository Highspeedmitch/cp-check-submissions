const mongoose = require("mongoose");

const WebPushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  deviceId: { type: String, default: "" },
  enabled: { type: Boolean, default: true },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

WebPushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
WebPushSubscriptionSchema.index({ organizationId: 1, userId: 1, enabled: 1 });

module.exports = mongoose.model("WebPushSubscription", WebPushSubscriptionSchema);
