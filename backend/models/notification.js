const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  contextOrganizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recipientScope: {
    type: String,
    enum: ["organization", "afterlight_resource", "platform"],
    default: "organization",
    index: true,
  },
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  route: { type: String, default: "/dashboard" },
  entityId: { type: String, default: "" },
  readAt: { type: Date, default: null },
  delivery: {
    attemptedAt: Date,
    successfulDevices: { type: Number, default: 0 },
    failedDevices: { type: Number, default: 0 },
  },
}, { timestamps: true });

NotificationSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
NotificationSchema.index({ recipientScope: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
