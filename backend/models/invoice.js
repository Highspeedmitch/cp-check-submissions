const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "Submission", required: true, unique: true },
  submitterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  invoiceNumber: { type: String, unique: true, sparse: true },
  propertySnapshot: {
    name: String,
    propertyCode: String,
    address: String,
    brokerageName: String,
    apMethod: String,
    apEmail: String,
    apPortal: String,
    billingInstructions: String,
    purchaseOrder: String,
  },
  inspectionDate: { type: Date, required: true },
  amountCents: { type: Number, min: 0, default: null },
  amountSetBySubmitter: { type: Boolean, default: false },
  policySnapshot: {
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: "BillingPolicy" },
    policyVersion: Number,
    policyName: String,
    amountControl: String,
    amountDefaultSource: String,
    amountAllowedRoles: [String],
    amountExcludedRoles: [String],
    amountMinimumCents: Number,
    amountMaximumCents: Number,
    approvalMode: String,
    approvalAuthorizedRoles: [String],
    approvalRequireManagedProperty: Boolean,
    approvalThresholdAmountCents: Number,
    approvalThresholdComparison: String,
    approvalThresholdBasis: String,
    approvalThresholdPeriod: String,
    approvalOverThresholdAction: String,
    submissionAllowedRoles: [String],
    submissionExcludedRoles: [String],
    approvalRequiredBeforeSubmission: Boolean,
    paymentStatusSource: String,
    paymentManualUpdateRoles: [String],
    paymentRequireManagedProperty: Boolean,
  },
  status: {
    type: String,
    enum: ["unbilled", "submitted", "paid", "failed", "void"],
    default: "unbilled",
    index: true,
  },
  pdfKey: { type: String, default: "" },
  delivery: {
    method: String,
    destination: String,
    sentAt: Date,
    confirmationNumber: String,
    error: String,
  },
  statusHistory: [{
    status: String,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changedAt: { type: Date, default: Date.now },
  }],
  archivedAt: { type: Date, default: null, index: true },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

InvoiceSchema.index({ organizationId: 1, submitterId: 1, status: 1, createdAt: -1 });
InvoiceSchema.index({ organizationId: 1, archivedAt: 1, createdAt: -1 });

module.exports = mongoose.model("Invoice", InvoiceSchema);
