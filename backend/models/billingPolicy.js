const mongoose = require("mongoose");

const BillingPolicySchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  name: { type: String, required: true },
  version: { type: Number, required: true, min: 1, default: 1 },
  active: { type: Boolean, default: true, index: true },
  amount: {
    control: {
      type: String,
      enum: ["submitter_editable", "property_fixed", "organization_fixed", "admin_set"],
      default: "submitter_editable",
    },
    defaultSource: {
      type: String,
      enum: ["property", "organization", "none"],
      default: "property",
    },
    allowedRoles: { type: [String], default: ["submitter"] },
    excludedRoles: { type: [String], default: ["admin"] },
    minimumCents: { type: Number, min: 0, default: 1 },
    maximumCents: { type: Number, min: 0, default: null },
  },
  approval: {
    mode: {
      type: String,
      enum: ["none", "always", "threshold"],
      default: "none",
    },
    authorizedRoles: {
      type: [String],
      default: [],
    },
    requireManagedProperty: { type: Boolean, default: true },
    threshold: {
      amountCents: { type: Number, min: 0, default: null },
      comparison: {
        type: String,
        enum: ["less_than", "less_than_or_equal", "greater_than", "greater_than_or_equal"],
        default: "less_than",
      },
      basis: {
        type: String,
        enum: ["per_invoice", "property_period_total", "organization_period_total"],
        default: "per_invoice",
      },
      period: {
        type: String,
        enum: ["none", "calendar_month", "rolling_30_days", "calendar_year"],
        default: "none",
      },
    },
    overThresholdAction: {
      type: String,
      enum: ["block", "admin_approval"],
      default: "block",
    },
  },
  submission: {
    allowedRoles: { type: [String], default: ["submitter"] },
    excludedRoles: { type: [String], default: ["admin"] },
    approvalRequiredBeforeSubmission: { type: Boolean, default: false },
  },
  administration: {
    billingSettingsRoles: { type: [String], default: ["admin"] },
  },
  payment: {
    statusSource: {
      type: String,
      enum: ["manual", "webhook", "api_sync", "import"],
      default: "manual",
    },
    manualUpdateRoles: {
      type: [String],
      default: ["admin", "property_manager"],
    },
    requireManagedProperty: { type: Boolean, default: true },
    integrationType: { type: String, default: null },
  },
}, { timestamps: true });

BillingPolicySchema.index({ organizationId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model("BillingPolicy", BillingPolicySchema);
