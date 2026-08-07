const mongoose = require("mongoose");

const InvoiceEmailAuthorizationSchema = new mongoose.Schema({
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
  reviewerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  reviewerEmail: { type: String, required: true },
  reviewCycle: { type: Number, required: true, min: 1 },
  tokenHash: { type: String, required: true, unique: true, index: true, select: false },
  status: {
    type: String,
    enum: ["active", "consumed", "revoked"],
    default: "active",
    index: true,
  },
  expiresAt: { type: Date, required: true, index: true },
  consumedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  emailSentAt: { type: Date, default: null },
  providerMessageId: { type: String, default: "" },
  deliveryError: { type: String, default: "" },
  requestIpAddress: { type: String, default: "" },
  requestUserAgent: { type: String, default: "" },
}, { timestamps: true });

InvoiceEmailAuthorizationSchema.index(
  { invoiceId: 1, reviewerUserId: 1, reviewCycle: 1 },
  { unique: true }
);
module.exports = mongoose.model(
  "InvoiceEmailAuthorization",
  InvoiceEmailAuthorizationSchema
);
