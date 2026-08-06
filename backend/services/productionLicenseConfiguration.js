const mongoose = require("mongoose");
const {
  LICENSE_TIERS,
  METERED_SERVICE_MODELS,
  defaultStoredLicense,
} = require("./licenseEntitlements");
const { capacitySnapshot: licensedCapacitySnapshot } = require("./licenseCapacity");
const { validateServiceModel } = require("./fulfillmentPolicy");

function normalizedName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizedNameKey(value) {
  return normalizedName(value).toLocaleLowerCase("en-US");
}

function configuredLimit(value, fallback, label) {
  const result = value == null ? fallback : value;
  if (!Number.isInteger(result) || result < fallback) {
    throw new Error(`${label} must be an integer greater than or equal to ${fallback}.`);
  }
  return result;
}

function normalizeProductionLicenseConfiguration(input = {}) {
  const name = normalizedName(input.name);
  if (name.length < 2 || name.length > 120) {
    throw new Error("Production organization name must be between 2 and 120 characters.");
  }
  const disposition = String(input.disposition || "licensed").trim();
  if (!["licensed", "historical"].includes(disposition)) {
    throw new Error(`${name} has an unsupported Production license disposition.`);
  }
  if (disposition === "historical") {
    if (input.serviceModel != null || input.tier != null
      || input.adminLimit != null || input.userLimit != null || input.propertyLimit != null) {
      throw new Error(`Historical organization ${name} cannot define an active service plan.`);
    }
    return { name, disposition };
  }
  const serviceModel = validateServiceModel(String(input.serviceModel || "").trim());
  const metered = METERED_SERVICE_MODELS.has(serviceModel);

  if (!metered) {
    if (input.tier != null || input.adminLimit != null || input.userLimit != null || input.propertyLimit != null) {
      throw new Error(`Managed Service organization ${name} cannot define metered license limits.`);
    }
    return {
      name,
      disposition,
      serviceModel,
      license: defaultStoredLicense(serviceModel, null),
    };
  }

  if (!LICENSE_TIERS.includes(input.tier)) {
    throw new Error(`${name} must define a valid license tier.`);
  }
  const defaults = defaultStoredLicense(serviceModel, input.tier);
  return {
    name,
    disposition,
    serviceModel,
    license: {
      tier: defaults.tier,
      adminLimit: configuredLimit(input.adminLimit, defaults.adminLimit, `${name} administrator limit`),
      userLimit: configuredLimit(input.userLimit, defaults.userLimit, `${name} user limit`),
      propertyLimit: configuredLimit(input.propertyLimit, defaults.propertyLimit, `${name} property limit`),
      adminSeatVersion: 0,
      capacityVersion: 0,
    },
  };
}

function storedLicenseSnapshot(organization = {}) {
  return {
    tier: organization.license?.tier ?? null,
    adminLimit: organization.license?.adminLimit ?? null,
    userLimit: organization.license?.userLimit ?? null,
    propertyLimit: organization.license?.propertyLimit ?? null,
    adminSeatVersion: Number(organization.license?.adminSeatVersion || 0),
    capacityVersion: Number(organization.license?.capacityVersion || 0),
  };
}

async function resolveQuery(query, session) {
  const scoped = session && query && typeof query.session === "function"
    ? query.session(session)
    : query;
  return scoped;
}

async function capacitySnapshot({
  organization,
  UserModel,
  InvitationModel,
  ResourceDeploymentModel,
  now,
  session,
}) {
  const [licensedCapacity, activeResourceDeployments] = await Promise.all([
    licensedCapacitySnapshot({ organization, UserModel, InvitationModel, now, session }),
    resolveQuery(ResourceDeploymentModel.countDocuments({
      organizationId: organization._id,
      status: { $in: ["active", "paused"] },
    }), session),
  ]);

  return {
    ...licensedCapacity,
    activeResourceDeployments,
  };
}

function overCapacity(capacity, license) {
  return {
    administrators: license.adminLimit === null
      ? false
      : capacity.allocatedAdministrators > license.adminLimit,
    users: license.userLimit === null
      ? false
      : capacity.allocatedUsers > license.userLimit,
    properties: license.propertyLimit === null
      ? false
      : capacity.properties > license.propertyLimit,
  };
}

function buildProductionLicensePlan(organization, configuration, capacity) {
  const previous = storedLicenseSnapshot(organization);
  const next = {
    ...configuration.license,
    adminSeatVersion: previous.adminSeatVersion,
    capacityVersion: previous.capacityVersion,
  };
  const capacityExceeded = overCapacity(capacity, next);
  const hasCapacityProblem = Object.values(capacityExceeded).some(Boolean);
  const serviceModel = organization.serviceModel || "managed";
  const changed = !organization.license || JSON.stringify(previous) !== JSON.stringify(next);

  return {
    name: organization.name,
    organizationId: organization._id,
    serviceModel,
    expectedServiceModel: configuration.serviceModel,
    disposition: "licensed",
    hadStoredLicense: Boolean(organization.license),
    status: serviceModel !== configuration.serviceModel
      ? "service_model_mismatch"
      : hasCapacityProblem
        ? "over_capacity"
        : changed
          ? "update"
          : "no_change",
    previous,
    next,
    capacity,
    capacityExceeded,
  };
}

function buildHistoricalRetentionPlan(organization, capacity) {
  const blockers = {
    activeOrganizationUsers: capacity.activeAdministrators + capacity.activeUsers,
    pendingInvitations: capacity.pendingAdministrators + capacity.pendingUsers,
    activeResourceDeployments: capacity.activeResourceDeployments,
  };
  const ready = Object.values(blockers).every((count) => count === 0);
  return {
    name: organization.name,
    organizationId: organization._id,
    serviceModel: organization.serviceModel || "managed",
    disposition: "historical",
    status: ready ? "historical_retained" : "historical_not_ready",
    capacity,
    blockers,
  };
}

function validateConfigurationCoverage(configurations) {
  const normalized = configurations.map(normalizeProductionLicenseConfiguration);
  const seen = new Set();
  for (const configuration of normalized) {
    const key = normalizedNameKey(configuration.name);
    if (seen.has(key)) {
      throw new Error(`Duplicate Production license configuration for ${configuration.name}.`);
    }
    seen.add(key);
  }
  return normalized;
}

async function buildProductionLicensePlans({
  configurations,
  OrganizationModel,
  UserModel,
  InvitationModel,
  ResourceDeploymentModel,
  now = new Date(),
  session = null,
}) {
  const normalized = validateConfigurationCoverage(configurations);
  const organizations = await resolveQuery(OrganizationModel.find({
    workspaceType: { $ne: "afterlight_workforce" },
  }), session);
  const organizationByName = new Map();
  for (const organization of organizations) {
    const key = normalizedNameKey(organization.name);
    if (organizationByName.has(key)) {
      throw new Error(`Production contains duplicate customer organization names matching ${organization.name}.`);
    }
    organizationByName.set(key, organization);
  }

  const configurationByName = new Map(normalized.map((configuration) => [
    normalizedNameKey(configuration.name),
    configuration,
  ]));
  const capacityByName = new Map(await Promise.all(organizations.map(async (organization) => ([
    normalizedNameKey(organization.name),
    await capacitySnapshot({
      organization,
      UserModel,
      InvitationModel,
      ResourceDeploymentModel,
      now,
      session,
    }),
  ]))));

  const plans = normalized.map((configuration) => {
    const key = normalizedNameKey(configuration.name);
    const organization = organizationByName.get(key);
    if (!organization) {
      return {
        name: configuration.name,
        expectedServiceModel: configuration.serviceModel,
        status: "missing",
      };
    }
    if (configuration.disposition === "historical") {
      return buildHistoricalRetentionPlan(organization, capacityByName.get(key));
    }
    return buildProductionLicensePlan(organization, configuration, capacityByName.get(key));
  });

  for (const organization of organizations) {
    const key = normalizedNameKey(organization.name);
    if (configurationByName.has(key)) continue;
    plans.push({
      name: organization.name,
      organizationId: organization._id,
      serviceModel: organization.serviceModel || "managed",
      status: "unmapped",
      capacity: capacityByName.get(key),
    });
  }

  return { plans, organizationByName };
}

function assertPlansReady(plans) {
  const readyStatuses = ["update", "no_change", "historical_retained"];
  const blocked = plans.filter((plan) => !readyStatuses.includes(plan.status));
  if (!blocked.length) return;
  const error = new Error(`Production license configuration blocked: ${blocked.map((plan) => `${plan.name} (${plan.status})`).join(", ")}.`);
  error.code = "PRODUCTION_LICENSE_CONFIGURATION_BLOCKED";
  error.plans = plans;
  throw error;
}

async function defaultTransactionRunner(operation) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function createAudit(PlatformAuditModel, audit, session) {
  if (session) return PlatformAuditModel.create([audit], { session });
  return PlatformAuditModel.create(audit);
}

async function configureProductionOrganizationLicenses({
  configurations,
  configurationVersion = "",
  actorUserId,
  apply = false,
  OrganizationModel,
  UserModel,
  InvitationModel,
  ResourceDeploymentModel,
  PlatformAuditModel,
  now = () => new Date(),
  transactionRunner = defaultTransactionRunner,
}) {
  const preview = await buildProductionLicensePlans({
    configurations,
    OrganizationModel,
    UserModel,
    InvitationModel,
    ResourceDeploymentModel,
    now: now(),
  });
  assertPlansReady(preview.plans);
  if (!apply) return preview.plans;

  return transactionRunner(async (session) => {
    const current = await buildProductionLicensePlans({
      configurations,
      OrganizationModel,
      UserModel,
      InvitationModel,
      ResourceDeploymentModel,
      now: now(),
      session,
    });
    assertPlansReady(current.plans);

    for (const plan of current.plans) {
      if (plan.status !== "update") continue;
      const organization = current.organizationByName.get(normalizedNameKey(plan.name));
      const configuredAt = now();
      organization.license = {
        ...plan.next,
        updatedAt: configuredAt,
        updatedBy: actorUserId,
      };
      await organization.save(session ? { session } : undefined);
      await createAudit(PlatformAuditModel, {
        actorUserId,
        action: "production_organization_license_configured",
        targetOrganizationId: organization._id,
        metadata: {
          name: organization.name,
          configurationVersion,
          serviceModel: plan.serviceModel,
          previous: plan.previous,
          next: plan.next,
          capacity: plan.capacity,
          capacityExceeded: plan.capacityExceeded,
        },
      }, session);
    }
    return current.plans;
  });
}

module.exports = {
  normalizedNameKey,
  normalizeProductionLicenseConfiguration,
  storedLicenseSnapshot,
  capacitySnapshot,
  overCapacity,
  buildProductionLicensePlan,
  buildHistoricalRetentionPlan,
  buildProductionLicensePlans,
  assertPlansReady,
  defaultTransactionRunner,
  configureProductionOrganizationLicenses,
};
