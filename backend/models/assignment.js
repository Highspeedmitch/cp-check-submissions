const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({
  propertyName: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true },
  eventType: { type: String, enum: ["QA Check", "Maintenance", "Cleaning"], required: false },
  status: {
    type: String,
    enum: ["scheduled", "completed", "canceled"],
    default: "scheduled",
  },
  notes: { type: String },
  oneTimeCheckRequest: { type: String, default: "" },
  fulfillment: {
    source: {
      type: String,
      enum: ["customer_employee", "customer_contractor", "afterlight_staff", "afterlight_contractor"],
      required: true,
    },
    sourceOrigin: {
      type: String,
      enum: ["organization_default", "property_default", "assignment_override"],
      required: true,
    },
    inheritedSource: { type: String, default: "" },
    organizationDefaultSource: { type: String, default: "" },
    queue: { type: String, enum: ["customer_assigned", "afterlight_coverage"], required: true },
    invoiceRouting: {
      type: String,
      enum: ["none", "customer_accounts_payable", "afterlight_service_billing"],
      required: true,
    },
    invoiceVisibility: {
      type: String,
      enum: ["none", "submitter_and_organization_oversight"],
      required: true,
    },
    invoiceRequired: { type: Boolean, required: true },
    policyVersion: { type: Number, default: 1 },
    resolvedAt: { type: Date, default: Date.now },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
}, { timestamps: true });

assignmentSchema.index({ propertyName: 1, startDate: 1, organizationId: 1 }, { unique: true });
assignmentSchema.index({ organizationId: 1, userId: 1, startDate: -1 });
assignmentSchema.index({ organizationId: 1, "fulfillment.queue": 1, startDate: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);
