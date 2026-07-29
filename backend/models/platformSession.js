const mongoose = require("mongoose");

const PlatformSessionSchema = new mongoose.Schema({
  platformAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  reason: { type: String, required: true, maxlength: 200 },
  startedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  endedAt: { type: Date, default: null },
  ipAddress: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  mutations: [{
    method: String,
    path: String,
    statusCode: Number,
    occurredAt: { type: Date, default: Date.now },
  }],
});

PlatformSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model("PlatformSession", PlatformSessionSchema);
