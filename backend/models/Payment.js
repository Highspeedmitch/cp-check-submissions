// models/Payment.js
const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  paidAt: { type: Date, default: Date.now },
  milesPaid: { type: Number, default: 0 },
  submissionsPaid: { type: Number, default: 0 },
  assignmentsCount: { type: Number, default: 0 },
  perSubmissionRate: { type: Number, default: 0 },
  perMileRate: { type: Number, default: 0 },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

PaymentSchema.index({ organizationId: 1, userId: 1, paidAt: -1 });

module.exports = mongoose.model("Payment", PaymentSchema);
