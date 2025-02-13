const mongoose = require("mongoose");

const paymentTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // ✅ Who approved the payment
  submissions: { type: Number, required: true },
  mileage: { type: Number, required: true },
  perSubmissionRate: { type: Number, required: true },
  perMileRate: { type: Number, required: true },
  totalPayment: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now }, // ✅ Timestamp
});

module.exports = mongoose.model("PaymentTransaction", paymentTransactionSchema);
