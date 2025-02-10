const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
  role: { type: String, enum: ["admin", "user"], default: "user" }, // Role field

  // 🚗 New Fields for Mileage Tracking
  totalMiles: { type: Number, default: 0 }, // Tracks miles since last payment
  lastLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },

  // 💰 Payment Tracking
  lastPaidDate: { type: Date, default: null }, // Used to reset mileage after payment
  paymentStatus: {
    type: String,
    enum: ["Awaiting Payment", "Paid"],
    default: "Awaiting Payment",
  },

  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
});

// ✅ Middleware: Reset mileage every new month
UserSchema.pre("save", function (next) {
  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  if (!this._month || this._month !== currentMonth) {
    this.totalMiles = 0; // Reset mileage
    this._month = currentMonth;
  }
  next();
});

module.exports = mongoose.model("User", UserSchema);
