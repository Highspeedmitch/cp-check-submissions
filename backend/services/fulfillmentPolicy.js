const SERVICE_MODELS = ["platform", "managed", "hybrid"];
const FULFILLMENT_SOURCES = [
  "customer_employee",
  "customer_contractor",
  "afterlight_staff",
  "afterlight_contractor",
];

const SERVICE_MODEL_DEFAULTS = {
  platform: "customer_employee",
  managed: "afterlight_staff",
  hybrid: "customer_employee",
};

const SOURCE_POLICIES = {
  customer_employee: { queue: "customer_assigned", invoiceRouting: "none", invoiceVisibility: "none", invoiceRequired: false },
  customer_contractor: { queue: "customer_assigned", invoiceRouting: "customer_accounts_payable", invoiceVisibility: "submitter_and_organization_oversight", invoiceRequired: true },
  afterlight_staff: { queue: "afterlight_coverage", invoiceRouting: "afterlight_service_billing", invoiceVisibility: "organization_oversight", invoiceRequired: true },
  afterlight_contractor: { queue: "afterlight_coverage", invoiceRouting: "afterlight_service_billing", invoiceVisibility: "organization_oversight", invoiceRequired: true },
};

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateServiceModel(value) {
  if (!SERVICE_MODELS.includes(value)) throw validationError("Select a valid service model.");
  return value;
}

function validateFulfillmentSource(value) {
  if (!FULFILLMENT_SOURCES.includes(value)) throw validationError("Select a valid fulfillment source.");
  return value;
}

function organizationDefaultSource(organization) {
  const explicit = organization?.fulfillmentPolicy?.defaultSource;
  if (FULFILLMENT_SOURCES.includes(explicit)) return explicit;
  const serviceModel = SERVICE_MODELS.includes(organization?.serviceModel)
    ? organization.serviceModel
    : "managed";
  return SERVICE_MODEL_DEFAULTS[serviceModel];
}

function propertyDefaultSource(organization, property) {
  const explicit = property?.fulfillmentPolicy?.defaultSource;
  return FULFILLMENT_SOURCES.includes(explicit)
    ? explicit
    : organizationDefaultSource(organization);
}

function policyForSource(source) {
  return { source, ...SOURCE_POLICIES[validateFulfillmentSource(source)] };
}

function resolveAssignmentFulfillment({ organization, property, requestedSource, actorUserId, resolvedAt = new Date() }) {
  const organizationSource = organizationDefaultSource(organization);
  const hasPropertyOverride = FULFILLMENT_SOURCES.includes(property?.fulfillmentPolicy?.defaultSource);
  const inheritedSource = propertyDefaultSource(organization, property);
  const hasAssignmentOverride = requestedSource !== undefined && requestedSource !== null && requestedSource !== "";
  const source = hasAssignmentOverride ? validateFulfillmentSource(requestedSource) : inheritedSource;

  return {
    ...policyForSource(source),
    sourceOrigin: hasAssignmentOverride
      ? "assignment_override"
      : hasPropertyOverride ? "property_default" : "organization_default",
    inheritedSource,
    organizationDefaultSource: organizationSource,
    policyVersion: Number(organization?.fulfillmentPolicy?.version || 1),
    resolvedAt,
    resolvedBy: actorUserId || null,
  };
}

function resolveDirectSubmissionFulfillment({ organization, actorUserId, resolvedAt = new Date() }) {
  return {
    ...policyForSource("customer_employee"),
    sourceOrigin: "direct_submitter",
    inheritedSource: organizationDefaultSource(organization),
    organizationDefaultSource: organizationDefaultSource(organization),
    policyVersion: Number(organization?.fulfillmentPolicy?.version || 1),
    resolvedAt,
    resolvedBy: actorUserId || null,
  };
}

function legacyFulfillmentSnapshot() {
  return {
    source: "legacy",
    sourceOrigin: "legacy",
    queue: "customer_assigned",
    invoiceRouting: "legacy_client_billing",
    invoiceVisibility: "submitter_and_organization_oversight",
    invoiceRequired: true,
    policyVersion: 0,
    resolvedAt: null,
    resolvedBy: null,
  };
}

module.exports = {
  SERVICE_MODELS,
  FULFILLMENT_SOURCES,
  SERVICE_MODEL_DEFAULTS,
  SOURCE_POLICIES,
  validateServiceModel,
  validateFulfillmentSource,
  organizationDefaultSource,
  propertyDefaultSource,
  policyForSource,
  resolveAssignmentFulfillment,
  resolveDirectSubmissionFulfillment,
  legacyFulfillmentSnapshot,
};
