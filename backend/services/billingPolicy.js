const BillingPolicy = require("../models/billingPolicy");
const Organization = require("../models/organization");

const DEFAULT_POLICY_VERSION = 1;

function defaultPolicyDefinition(organizationId) {
  return {
    organizationId,
    name: "Standard submitter-controlled billing",
    version: DEFAULT_POLICY_VERSION,
    active: true,
    amount: {
      control: "submitter_editable",
      defaultSource: "property",
      allowedRoles: ["submitter"],
      excludedRoles: ["admin"],
      minimumCents: 1,
      maximumCents: null,
    },
    approval: {
      mode: "none",
      authorizedRoles: [],
      requireManagedProperty: true,
      threshold: {
        amountCents: null,
        comparison: "less_than",
        basis: "per_invoice",
        period: "none",
      },
      overThresholdAction: "block",
    },
    submission: {
      allowedRoles: ["submitter"],
      excludedRoles: ["admin"],
      approvalRequiredBeforeSubmission: false,
    },
    administration: {
      billingSettingsRoles: ["admin"],
    },
    payment: {
      statusSource: "manual",
      manualUpdateRoles: ["admin", "property_manager"],
      requireManagedProperty: true,
      integrationType: null,
    },
  };
}

async function ensureOrganizationBillingPolicy(organizationId) {
  const organization = await Organization.findById(organizationId);
  if (!organization) throw new Error("Organization not found.");

  if (organization.billingPolicyId) {
    const assignedPolicy = await BillingPolicy.findOne({
      _id: organization.billingPolicyId,
      organizationId,
      active: true,
    });
    if (assignedPolicy) return { organization, policy: assignedPolicy };
  }

  const definition = defaultPolicyDefinition(organizationId);
  const policy = await BillingPolicy.findOneAndUpdate(
    { organizationId, version: DEFAULT_POLICY_VERSION },
    { $setOnInsert: definition },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  organization.billingPolicyId = policy._id;
  await organization.save();
  return { organization, policy };
}

function sameId(left, right) {
  return Boolean(left && right && left.toString() === right.toString());
}

function isManagedProperty(property, user) {
  return property?.propertyManagers?.some((id) => sameId(id, user.userId));
}

function evaluatePolicyAction({ policy, action, user, invoice, property }) {
  if (!policy?.active) {
    return { allowed: false, reason: "The organization does not have an active billing policy." };
  }

  if (action === "manage_property_billing") {
    return policy.administration.billingSettingsRoles.includes(user.role)
      ? { allowed: true }
      : { allowed: false, reason: "Your role cannot manage property billing." };
  }

  if (["set_amount", "generate_invoice", "submit_invoice"].includes(action)) {
    if (!sameId(invoice?.submitterId, user.userId)) {
      return { allowed: false, reason: "Only the invoice submitter can perform this action." };
    }
    if (action === "set_amount") {
      if (policy.amount.excludedRoles.includes(user.role)
        || !policy.amount.allowedRoles.includes("submitter")
        || policy.amount.control !== "submitter_editable") {
        return { allowed: false, reason: "This organization's policy does not allow this role to change invoice amounts." };
      }
    }
    if (["generate_invoice", "submit_invoice"].includes(action)) {
      if (policy.submission.excludedRoles.includes(user.role)
        || !policy.submission.allowedRoles.includes("submitter")) {
        return { allowed: false, reason: "This organization's policy does not allow this role to process invoices." };
      }
    }
    return { allowed: true };
  }

  if (action === "mark_paid") {
    if (policy.payment.statusSource !== "manual") {
      return { allowed: false, reason: "Payment status is controlled by an external payment source." };
    }
    if (!policy.payment.manualUpdateRoles.includes(user.role)) {
      return { allowed: false, reason: "Your role cannot manually update payment status." };
    }
    if (user.role === "property_manager"
      && policy.payment.requireManagedProperty
      && !isManagedProperty(property, user)) {
      return { allowed: false, reason: "Property managers can only update properties assigned to them." };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: "Unsupported billing-policy action." };
}

async function evaluateOrganizationBillingAction({
  organizationId,
  action,
  user,
  invoice,
  propertyId,
}) {
  const { organization, policy } = await ensureOrganizationBillingPolicy(organizationId);
  const targetPropertyId = propertyId || invoice?.propertyId;
  const property = targetPropertyId
    ? organization.properties.id(targetPropertyId)
    : null;
  return {
    ...evaluatePolicyAction({ policy, action, user, invoice, property }),
    organization,
    policy,
    property,
  };
}

function createPolicySnapshot(policy) {
  return {
    policyId: policy._id,
    policyVersion: policy.version,
    policyName: policy.name,
    amountControl: policy.amount.control,
    amountDefaultSource: policy.amount.defaultSource,
    amountAllowedRoles: [...policy.amount.allowedRoles],
    amountExcludedRoles: [...policy.amount.excludedRoles],
    amountMinimumCents: policy.amount.minimumCents,
    amountMaximumCents: policy.amount.maximumCents,
    approvalMode: policy.approval.mode,
    approvalAuthorizedRoles: [...policy.approval.authorizedRoles],
    approvalRequireManagedProperty: policy.approval.requireManagedProperty,
    approvalThresholdAmountCents: policy.approval.threshold.amountCents,
    approvalThresholdComparison: policy.approval.threshold.comparison,
    approvalThresholdBasis: policy.approval.threshold.basis,
    approvalThresholdPeriod: policy.approval.threshold.period,
    approvalOverThresholdAction: policy.approval.overThresholdAction,
    submissionAllowedRoles: [...policy.submission.allowedRoles],
    submissionExcludedRoles: [...policy.submission.excludedRoles],
    approvalRequiredBeforeSubmission: policy.submission.approvalRequiredBeforeSubmission,
    paymentStatusSource: policy.payment.statusSource,
    paymentManualUpdateRoles: [...policy.payment.manualUpdateRoles],
    paymentRequireManagedProperty: policy.payment.requireManagedProperty,
  };
}

module.exports = {
  DEFAULT_POLICY_VERSION,
  defaultPolicyDefinition,
  ensureOrganizationBillingPolicy,
  evaluatePolicyAction,
  evaluateOrganizationBillingAction,
  createPolicySnapshot,
};
