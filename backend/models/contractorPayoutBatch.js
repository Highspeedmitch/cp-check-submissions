const mongoose = require("mongoose");

const PayoutLineSchema = new mongoose.Schema({
  resourceProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "ResourceProfile", required: true },
  gustoContractorUuid: { type: String, required: true },
  earningIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  grossAmountCents: { type: Number, min: 0, required: true },
  reimbursementCents: { type: Number, min: 0, default: 0 },
  totalAmountCents: { type: Number, min: 0, required: true },
}, { _id: false });

const ContractorPayoutBatchSchema = new mongoose.Schema({
  batchNumber: { type: String, required: true, unique: true },
  provider: { type: String, enum: ["gusto"], default: "gusto" },
  status: {
    type: String,
    enum: ["ready", "submitted", "paid", "failed"],
    default: "ready",
    index: true,
  },
  earningIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  lines: { type: [PayoutLineSchema], default: [] },
  totalAmountCents: { type: Number, min: 0, required: true },
  currency: { type: String, enum: ["USD"], default: "USD" },
  checkDate: { type: Date, required: true },
  gustoPaymentGroupUuid: { type: String, default: "", trim: true },
  submittedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  failureReason: { type: String, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

ContractorPayoutBatchSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("ContractorPayoutBatch", ContractorPayoutBatchSchema);
