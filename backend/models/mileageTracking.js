const mongoose = require("mongoose");

const mileageTrackingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  totalMiles: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  month: { type: String, default: () => new Date().toISOString().slice(0, 7) }, // "YYYY-MM"
});

mileageTrackingSchema.pre("save", function (next) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (this.month !== currentMonth) {
    this.totalMiles = 0; // Reset mileage if it's a new month
    this.month = currentMonth;
  }
  next();
});

module.exports = mongoose.model("MileageTracking", mileageTrackingSchema);