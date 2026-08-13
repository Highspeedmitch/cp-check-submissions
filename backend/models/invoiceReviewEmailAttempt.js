const mongoose = require("mongoose");

const RecipientSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  email: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "accepted", "delayed", "delivered", "failed"],
    default: "pending",
  },
  providerMessageId: { type: String, default: "" },
  acceptedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  lastEventAt: { type: Date, default: null },
  lastEventType: { type: String, default: "" },
  lastEventMessageId: { type: String, default: "" },
  lastEventRank: { type: Number, min: 0, default: 0 },
  errorCode: { type: String, default: "" },
  error: { type: String, default: "" },
}, { _id: false });

const InvoiceReviewEmailAttemptSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice",
    required: true,
    index: true,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  reviewCycle: { type: Number, required: true, min: 1 },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  requestId: { type: String, required: true },
  reason: { type: String, required: true, maxlength: 500 },
  status: {
    type: String,
    enum: ["sending", "accepted", "delayed", "delivered", "partial_failure", "failed"],
    default: "sending",
    index: true,
  },
  recipients: { type: [RecipientSchema], default: [] },
  invoicePdfKey: { type: String, required: true },
  inspectionPdfKey: { type: String, required: true },
  acceptedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  error: { type: String, default: "" },
}, { timestamps: true });

InvoiceReviewEmailAttemptSchema.index(
  { invoiceId: 1, requestId: 1 },
  { unique: true }
);
InvoiceReviewEmailAttemptSchema.index({ "recipients.providerMessageId": 1 });

module.exports = mongoose.model(
  "InvoiceReviewEmailAttempt",
  InvoiceReviewEmailAttemptSchema
);
