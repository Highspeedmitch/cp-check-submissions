const mongoose = require("mongoose");

const ContractorEarningSchema = new mongoose.Schema({
  resourceProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ResourceProfile",
    required: true,
    index: true,
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  propertyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assignment",
    required: true,
    unique: true,
  },
  submissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Submission",
    required: true,
    unique: true,
  },
  grossAmountCents: { type: Number, min: 0, required: true },
  reimbursementCents: { type: Number, min: 0, default: 0 },
  currency: { type: String, enum: ["USD"], default: "USD" },
  compensationSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: ["pending_approval", "approved", "payout_pending", "paid", "void"],
    default: "pending_approval",
    index: true,
  },
  earnedAt: { type: Date, required: true },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  payoutBatchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ContractorPayoutBatch",
    default: null,
    index: true,
  },
  paidAt: { type: Date, default: null },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  voidReason: { type: String, default: "" },
}, { timestamps: true });

ContractorEarningSchema.index({ status: 1, earnedAt: -1 });
ContractorEarningSchema.index({ resourceProfileId: 1, status: 1, earnedAt: -1 });

module.exports = mongoose.model("ContractorEarning", ContractorEarningSchema);
