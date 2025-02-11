// models/user.js

const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
  role: { type: String, enum: ["admin", "user"], default: "user" },

  // Optionally keep these if you want to track payments at the User level:
  lastPaidDate: { type: Date, default: null },
  paymentStatus: {
    type: String,
    enum: ["Awaiting Payment", "Paid"],
    default: "Awaiting Payment",
  },

  // For password resets:
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
});

module.exports = mongoose.model("User", UserSchema);
