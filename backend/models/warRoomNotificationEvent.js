const mongoose = require("mongoose");

const WarRoomNotificationEventSchema = new mongoose.Schema({
  dedupeKey: { type: String, required: true, unique: true, maxlength: 500 },
  type: {
    type: String,
    enum: ["war_room_organization_behind", "war_room_weekly_digest"],
    required: true,
  },
  contextOrganizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    default: null,
  },
  periodKey: { type: String, required: true, maxlength: 20 },
  weekKey: { type: String, required: true, maxlength: 20 },
  event: { type: mongoose.Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: ["queued", "processing", "completed", "failed"],
    default: "queued",
    index: true,
  },
  attempts: { type: Number, min: 0, default: 0 },
  maxAttempts: { type: Number, min: 1, max: 10, default: 5 },
  availableAt: { type: Date, default: Date.now, index: true },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: String, default: "", maxlength: 240 },
  completedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  lastError: { type: String, default: "", maxlength: 500 },
}, { timestamps: true });

WarRoomNotificationEventSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
WarRoomNotificationEventSchema.index({ status: 1, lockedAt: 1 });

module.exports = mongoose.model("WarRoomNotificationEvent", WarRoomNotificationEventSchema);
