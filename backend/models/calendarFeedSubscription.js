const mongoose = require("mongoose");

const calendarFeedSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    select: false,
  },
  active: { type: Boolean, default: true, index: true },
  generatedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },
  lastAccessedAt: { type: Date, default: null },
}, { timestamps: true, autoIndex: false });

module.exports = mongoose.model("CalendarFeedSubscription", calendarFeedSubscriptionSchema);
