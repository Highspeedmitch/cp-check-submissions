// mileageTracking.js
const mongoose = require("mongoose");

const mileageTrackingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  
  // The "running total" of miles since last payment
  totalMiles: { type: Number, default: 0 },

  // Keep a log of past mileage totals, for reference
  history: [
    {
      paidDate: { type: Date },           // When the user got paid
      milesPaid: { type: Number },        // How many miles were paid out that day
      // (Optionally, store the $ rate or the $$ paid for mileage if you like)
      note: { type: String }              // e.g. "Payment #3"
    }
  ],

  // We can keep "lastUpdated" if you still want to know last time we updated
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model("MileageTracking", mileageTrackingSchema);
