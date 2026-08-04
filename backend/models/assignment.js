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
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  completedAt: { type: Date, default: null },
  calendarSequence: { type: Number, min: 0, default: 0 },
  canceledAt: { type: Date, default: null },
  canceledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  resourceProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ResourceProfile",
    default: null,
    index: true,
  },
  resourceDeploymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ResourceDeployment",
    default: null,
  },
  compensationSnapshot: {
    payeeType: { type: String, enum: ["afterlight_contractor"], default: null },
    rateType: { type: String, enum: ["per_assignment"], default: null },
    amountCents: { type: Number, min: 0, default: null },
    currency: { type: String, enum: ["USD"], default: null },
    snapshottedAt: { type: Date, default: null },
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
      enum: ["none", "submitter_and_organization_oversight", "organization_oversight"],
      required: true,
    },
    invoiceRequired: { type: Boolean, required: true },
    policyVersion: { type: Number, default: 1 },
    resolvedAt: { type: Date, default: Date.now },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
}, { timestamps: true, autoIndex: false });

assignmentSchema.index(
  { propertyName: 1, startDate: 1, organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "scheduled" },
    name: "scheduled_property_start_organization_unique",
  }
);
assignmentSchema.index({ organizationId: 1, userId: 1, startDate: -1 });
assignmentSchema.index({ organizationId: 1, "fulfillment.queue": 1, startDate: 1 });
assignmentSchema.index({ resourceProfileId: 1, status: 1, startDate: 1 });
assignmentSchema.index({ userId: 1, status: 1, startDate: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);
