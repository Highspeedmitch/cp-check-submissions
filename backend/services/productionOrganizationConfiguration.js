const {
  SERVICE_MODEL_DEFAULTS,
  organizationDefaultSource,
  validateServiceModel,
  validateFulfillmentSource,
} = require("./fulfillmentPolicy");
const { caseInsensitiveExact } = require("./organizationProvisioning");

function normalizeProductionOrganizationConfiguration(input = {}) {
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) {
    throw new Error("Production organization name must be between 2 and 120 characters.");
  }
  const serviceModel = validateServiceModel(String(input.serviceModel || "").trim());
  const defaultFulfillmentSource = validateFulfillmentSource(String(
    input.defaultFulfillmentSource || SERVICE_MODEL_DEFAULTS[serviceModel]
  ).trim());
  return {
    name,
    serviceModel,
    defaultFulfillmentSource,
    clearPropertyFulfillmentOverrides: input.clearPropertyFulfillmentOverrides === true,
  };
}

function propertyOverrideCount(organization) {
  return (organization.properties || []).filter(
    (property) => Boolean(property.fulfillmentPolicy?.defaultSource)
  ).length;
}

function buildProductionOrganizationPlan(organization, configuration) {
  const config = normalizeProductionOrganizationConfiguration(configuration);
  if (!organization) {
    return { name: config.name, status: "missing", configuration: config };
  }

  const previous = {
    serviceModel: organization.serviceModel || "managed",
    defaultFulfillmentSource: organizationDefaultSource(organization),
    policyVersion: Number(organization.fulfillmentPolicy?.version || 1),
  };
  const clearedPropertyOverrides = config.clearPropertyFulfillmentOverrides
    ? propertyOverrideCount(organization)
    : 0;
  const policyChanged = previous.serviceModel !== config.serviceModel
    || previous.defaultFulfillmentSource !== config.defaultFulfillmentSource
    || clearedPropertyOverrides > 0;
  const next = {
    serviceModel: config.serviceModel,
    defaultFulfillmentSource: config.defaultFulfillmentSource,
    policyVersion: previous.policyVersion + (policyChanged ? 1 : 0),
  };

  return {
    name: organization.name,
    organizationId: organization._id,
    status: policyChanged ? "update" : "no_change",
    previous,
    next,
    clearedPropertyOverrides,
    configuration: config,
  };
}

async function configureProductionOrganizations({
  configurations,
  actorUserId,
  apply = false,
  OrganizationModel,
  FulfillmentAuditModel,
  PlatformAuditModel,
  now = () => new Date(),
}) {
  const normalized = configurations.map(normalizeProductionOrganizationConfiguration);
  const organizations = await Promise.all(normalized.map((configuration) => (
    OrganizationModel.findOne({ name: caseInsensitiveExact(configuration.name) })
  )));
  const plans = organizations.map((organization, index) => (
    buildProductionOrganizationPlan(organization, normalized[index])
  ));
  const missing = plans.filter((plan) => plan.status === "missing");
  if (missing.length) {
    const error = new Error(`Production organizations not found: ${missing.map((plan) => plan.name).join(", ")}.`);
    error.plans = plans;
    throw error;
  }
  if (!apply) return plans;

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    if (plan.status !== "update") continue;
    const organization = organizations[index];
    const configuredAt = now();

    if (plan.configuration.clearPropertyFulfillmentOverrides) {
      for (const property of organization.properties || []) {
        if (!property.fulfillmentPolicy?.defaultSource) continue;
        property.fulfillmentPolicy = {
          defaultSource: null,
          updatedBy: actorUserId,
          updatedAt: configuredAt,
        };
      }
    }
    organization.serviceModel = plan.next.serviceModel;
    organization.fulfillmentPolicy = {
      defaultSource: plan.next.defaultFulfillmentSource,
      version: plan.next.policyVersion,
      updatedBy: actorUserId,
      updatedAt: configuredAt,
    };
    await organization.save();

    await FulfillmentAuditModel.create({
      organizationId: organization._id,
      actorUserId,
      entityType: "organization",
      entityId: String(organization._id),
      action: "production_organization_configured",
      previousValue: plan.previous,
      nextValue: plan.next,
      reason: "Production release configuration",
      metadata: {
        clearedPropertyOverrides: plan.clearedPropertyOverrides,
        appliesTo: "future_assignments_only",
      },
    });
    await PlatformAuditModel.create({
      actorUserId,
      action: "production_organization_configured",
      targetOrganizationId: organization._id,
      metadata: {
        name: organization.name,
        previous: plan.previous,
        next: plan.next,
        clearedPropertyOverrides: plan.clearedPropertyOverrides,
      },
    });
  }
  return plans;
}

module.exports = {
  normalizeProductionOrganizationConfiguration,
  buildProductionOrganizationPlan,
  configureProductionOrganizations,
};
