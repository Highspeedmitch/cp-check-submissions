const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../config/productionOrganizationLicenses");
const productionOrganizations = require("../config/productionOrganizations");
const {
  APPLY_CONFIRMATION,
  parseArguments,
  requireProductionApplyApproval,
  summarizePlan,
} = require("../scripts/configureProductionOrganizationLicenses");
const {
  normalizeProductionLicenseConfiguration,
  buildProductionLicensePlan,
  buildHistoricalRetentionPlan,
  buildProductionLicensePlans,
  configureProductionOrganizationLicenses,
} = require("../services/productionLicenseConfiguration");

const PICOR_CONFIGURATION = {
  name: "Picor",
  disposition: "licensed",
  serviceModel: "managed",
  tier: null,
};

const HISTORICAL_CONFIGURATIONS = [
  { name: "AzRoots", disposition: "historical" },
  { name: "HSLD", disposition: "historical" },
  { name: "Breezykeyzy", disposition: "historical" },
];

function organization(overrides = {}) {
  let saveCount = 0;
  let saveOptions;
  const value = {
    _id: "org-picor",
    name: "Picor",
    workspaceType: "customer",
    serviceModel: "managed",
    properties: [{ name: "Property 1" }],
    save: async (options) => {
      saveCount += 1;
      saveOptions = options;
    },
    ...overrides,
  };
  value.saved = () => ({ count: saveCount, options: saveOptions });
  return value;
}

function modelFixture({ organizations = [organization()], counts = {} } = {}) {
  const queries = { organizations: [], users: [], invitations: [], deployments: [] };
  const OrganizationModel = {
    find: (query) => {
      queries.organizations.push(query);
      return organizations;
    },
  };
  const UserModel = {
    countDocuments: (query) => {
      queries.users.push(query);
      return query.role === "admin"
        ? (counts.activeAdministrators || 0)
        : (counts.activeUsers || 0);
    },
  };
  const InvitationModel = {
    countDocuments: (query) => {
      queries.invitations.push(query);
      return query.role === "admin"
        ? (counts.pendingAdministrators || 0)
        : (counts.pendingUsers || 0);
    },
  };
  const ResourceDeploymentModel = {
    countDocuments: (query) => {
      queries.deployments.push(query);
      return counts.activeResourceDeployments || 0;
    },
  };
  return { OrganizationModel, UserModel, InvitationModel, ResourceDeploymentModel, queries };
}

test("Production license manifest explicitly configures Picor as Managed Service", () => {
  assert.equal(manifest.version, "2026-08-06-production-license-dispositions-v1");
  assert.deepEqual(manifest.organizations, [PICOR_CONFIGURATION, ...HISTORICAL_CONFIGURATIONS]);
  const normalized = normalizeProductionLicenseConfiguration(PICOR_CONFIGURATION);
  assert.deepEqual(normalized.license, {
    tier: null,
    adminLimit: null,
    userLimit: null,
    propertyLimit: null,
    adminSeatVersion: 0,
  });
  assert.equal(
    productionOrganizations.find((entry) => entry.name === "Picor").serviceModel,
    manifest.organizations.find((entry) => entry.name === "Picor").serviceModel
  );
});

test("metered Production license configurations require a valid tier and cannot undercut tier limits", () => {
  assert.throws(() => normalizeProductionLicenseConfiguration({
    name: "SaaS Customer",
    serviceModel: "platform",
  }), /valid license tier/);
  assert.throws(() => normalizeProductionLicenseConfiguration({
    name: "SaaS Customer",
    serviceModel: "platform",
    tier: "tier_2",
    adminLimit: 2,
  }), /greater than or equal to 3/);

  const normalized = normalizeProductionLicenseConfiguration({
    name: "Hybrid Customer",
    serviceModel: "hybrid",
    tier: "tier_2",
    propertyLimit: 75,
  });
  assert.deepEqual(normalized.license, {
    tier: "tier_2",
    adminLimit: 3,
    userLimit: 20,
    propertyLimit: 75,
    adminSeatVersion: 0,
  });
});

test("Managed Service migration writes an explicit unmetered license record", () => {
  const plan = buildProductionLicensePlan(
    organization({ license: undefined }),
    normalizeProductionLicenseConfiguration(PICOR_CONFIGURATION),
    {
      activeAdministrators: 3,
      pendingAdministrators: 1,
      allocatedAdministrators: 4,
      activeUsers: 20,
      pendingUsers: 2,
      allocatedUsers: 22,
      properties: 50,
    }
  );
  assert.equal(plan.status, "update");
  assert.equal(plan.capacityExceeded.administrators, false);
  assert.equal(plan.capacityExceeded.users, false);
  assert.equal(plan.capacityExceeded.properties, false);
});

test("inventory excludes the Afterlight workforce and Afterlight resource accounts from customer capacity", async () => {
  const fixture = modelFixture();
  await buildProductionLicensePlans({
    configurations: [PICOR_CONFIGURATION],
    OrganizationModel: fixture.OrganizationModel,
    UserModel: fixture.UserModel,
    InvitationModel: fixture.InvitationModel,
    ResourceDeploymentModel: fixture.ResourceDeploymentModel,
  });

  assert.deepEqual(fixture.queries.organizations[0], {
    workspaceType: { $ne: "afterlight_workforce" },
  });
  assert.deepEqual(fixture.queries.users[0].$or, [
    { accountScope: "organization" },
    { accountScope: { $exists: false } },
  ]);
  assert.deepEqual(fixture.queries.invitations[0].accountScope, {
    $ne: "afterlight_resource",
  });
  assert.deepEqual(fixture.queries.deployments[0].status, {
    $in: ["active", "paused"],
  });
});

test("historical organizations are retained only after live access and deployments are cleared", () => {
  const historical = organization({ _id: "org-legacy", name: "AzRoots" });
  const blocked = buildHistoricalRetentionPlan(historical, {
    activeAdministrators: 1,
    pendingAdministrators: 0,
    allocatedAdministrators: 1,
    activeUsers: 3,
    pendingUsers: 0,
    allocatedUsers: 3,
    properties: 5,
    activeResourceDeployments: 0,
  });
  assert.equal(blocked.status, "historical_not_ready");
  assert.equal(blocked.blockers.activeOrganizationUsers, 4);

  const retained = buildHistoricalRetentionPlan(historical, {
    activeAdministrators: 0,
    pendingAdministrators: 0,
    allocatedAdministrators: 0,
    activeUsers: 0,
    pendingUsers: 0,
    allocatedUsers: 0,
    properties: 5,
    activeResourceDeployments: 0,
  });
  assert.equal(retained.status, "historical_retained");
  assert.equal(retained.capacity.properties, 5);
});

test("applying a ready historical disposition preserves the organization without a license write", async () => {
  const legacy = organization({ _id: "org-legacy", name: "AzRoots", license: undefined });
  const fixture = modelFixture({ organizations: [legacy] });
  let audits = 0;
  const plans = await configureProductionOrganizationLicenses({
    configurations: [{ name: "AzRoots", disposition: "historical" }],
    configurationVersion: manifest.version,
    actorUserId: "admin-1",
    apply: true,
    OrganizationModel: fixture.OrganizationModel,
    UserModel: fixture.UserModel,
    InvitationModel: fixture.InvitationModel,
    ResourceDeploymentModel: fixture.ResourceDeploymentModel,
    PlatformAuditModel: { create: async () => { audits += 1; } },
    transactionRunner: async (operation) => operation({ id: "session" }),
  });

  assert.equal(plans[0].status, "historical_retained");
  assert.equal(legacy.license, undefined);
  assert.equal(legacy.saved().count, 0);
  assert.equal(audits, 0);
});

test("dry run reports the plan without saving or auditing", async () => {
  const picor = organization({ license: undefined });
  const fixture = modelFixture({
    organizations: [picor],
    counts: { activeAdministrators: 1, activeUsers: 4, pendingUsers: 1 },
  });
  let audits = 0;
  const plans = await configureProductionOrganizationLicenses({
    configurations: [PICOR_CONFIGURATION],
    configurationVersion: manifest.version,
    actorUserId: "admin-1",
    apply: false,
    OrganizationModel: fixture.OrganizationModel,
    UserModel: fixture.UserModel,
    InvitationModel: fixture.InvitationModel,
    ResourceDeploymentModel: fixture.ResourceDeploymentModel,
    PlatformAuditModel: { create: async () => { audits += 1; } },
  });

  assert.equal(plans[0].status, "update");
  assert.equal(plans[0].capacity.allocatedAdministrators, 1);
  assert.equal(plans[0].capacity.allocatedUsers, 5);
  assert.equal(picor.saved().count, 0);
  assert.equal(audits, 0);
});

test("apply rechecks inventory in a transaction, writes the license, and creates an audit", async () => {
  const picor = organization({ license: undefined });
  const fixture = modelFixture({ organizations: [picor] });
  const audits = [];
  const session = { id: "production-license-transaction" };
  const plans = await configureProductionOrganizationLicenses({
    configurations: [PICOR_CONFIGURATION],
    configurationVersion: manifest.version,
    actorUserId: "admin-1",
    apply: true,
    OrganizationModel: fixture.OrganizationModel,
    UserModel: fixture.UserModel,
    InvitationModel: fixture.InvitationModel,
    ResourceDeploymentModel: fixture.ResourceDeploymentModel,
    PlatformAuditModel: {
      create: async (records, options) => audits.push({ records, options }),
    },
    now: () => new Date("2026-08-06T12:00:00.000Z"),
    transactionRunner: async (operation) => operation(session),
  });

  assert.equal(plans[0].status, "update");
  assert.equal(picor.license.tier, null);
  assert.equal(picor.license.adminLimit, null);
  assert.equal(picor.license.updatedBy, "admin-1");
  assert.equal(picor.license.updatedAt.toISOString(), "2026-08-06T12:00:00.000Z");
  assert.deepEqual(picor.saved(), { count: 1, options: { session } });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].records[0].action, "production_organization_license_configured");
  assert.equal(audits[0].records[0].metadata.configurationVersion, manifest.version);
  assert.deepEqual(audits[0].options, { session });
});

test("an already configured organization is idempotent", async () => {
  const picor = organization({
    license: {
      tier: null,
      adminLimit: null,
      userLimit: null,
      propertyLimit: null,
      adminSeatVersion: 7,
    },
  });
  const fixture = modelFixture({ organizations: [picor] });
  const plans = await configureProductionOrganizationLicenses({
    configurations: [PICOR_CONFIGURATION],
    actorUserId: "admin-1",
    apply: false,
    OrganizationModel: fixture.OrganizationModel,
    UserModel: fixture.UserModel,
    InvitationModel: fixture.InvitationModel,
    ResourceDeploymentModel: fixture.ResourceDeploymentModel,
    PlatformAuditModel: { create: async () => assert.fail("unexpected audit") },
  });

  assert.equal(plans[0].status, "no_change");
  assert.equal(plans[0].next.adminSeatVersion, 7);
  assert.equal(picor.saved().count, 0);
});

test("unmapped and missing Production customer organizations fail closed", async () => {
  const rogue = organization({ _id: "org-rogue", name: "Unmapped Customer" });
  const unmappedFixture = modelFixture({ organizations: [organization(), rogue] });
  await assert.rejects(configureProductionOrganizationLicenses({
    configurations: [PICOR_CONFIGURATION],
    actorUserId: "admin-1",
    apply: false,
    OrganizationModel: unmappedFixture.OrganizationModel,
    UserModel: unmappedFixture.UserModel,
    InvitationModel: unmappedFixture.InvitationModel,
    ResourceDeploymentModel: unmappedFixture.ResourceDeploymentModel,
    PlatformAuditModel: { create: async () => assert.fail("unexpected audit") },
  }), /Unmapped Customer \(unmapped\)/);

  const missingFixture = modelFixture({ organizations: [] });
  await assert.rejects(configureProductionOrganizationLicenses({
    configurations: [PICOR_CONFIGURATION],
    actorUserId: "admin-1",
    apply: false,
    OrganizationModel: missingFixture.OrganizationModel,
    UserModel: missingFixture.UserModel,
    InvitationModel: missingFixture.InvitationModel,
    ResourceDeploymentModel: missingFixture.ResourceDeploymentModel,
    PlatformAuditModel: { create: async () => assert.fail("unexpected audit") },
  }), /Picor \(missing\)/);
});

test("service-model mismatches and over-capacity metered organizations block writes", async () => {
  const mismatchFixture = modelFixture({
    organizations: [organization({ serviceModel: "hybrid" })],
  });
  await assert.rejects(configureProductionOrganizationLicenses({
    configurations: [PICOR_CONFIGURATION],
    actorUserId: "admin-1",
    apply: false,
    OrganizationModel: mismatchFixture.OrganizationModel,
    UserModel: mismatchFixture.UserModel,
    InvitationModel: mismatchFixture.InvitationModel,
    ResourceDeploymentModel: mismatchFixture.ResourceDeploymentModel,
    PlatformAuditModel: { create: async () => assert.fail("unexpected audit") },
  }), /service_model_mismatch/);

  const meteredFixture = modelFixture({
    organizations: [organization({ name: "SaaS Customer", serviceModel: "platform" })],
    counts: { activeAdministrators: 3 },
  });
  await assert.rejects(configureProductionOrganizationLicenses({
    configurations: [{ name: "SaaS Customer", serviceModel: "platform", tier: "tier_1" }],
    actorUserId: "admin-1",
    apply: false,
    OrganizationModel: meteredFixture.OrganizationModel,
    UserModel: meteredFixture.UserModel,
    InvitationModel: meteredFixture.InvitationModel,
    ResourceDeploymentModel: meteredFixture.ResourceDeploymentModel,
    PlatformAuditModel: { create: async () => assert.fail("unexpected audit") },
  }), /over_capacity/);
});

test("Production apply requires environment, confirmation, and reviewed manifest version", () => {
  assert.deepEqual(parseArguments([]), { apply: false });
  assert.throws(() => parseArguments(["--unknown"]), /Unsupported arguments/);
  assert.doesNotThrow(() => requireProductionApplyApproval({ apply: false, env: {} }));
  assert.throws(
    () => requireProductionApplyApproval({ apply: true, env: {} }),
    /NODE_ENV=production/
  );
  assert.throws(() => requireProductionApplyApproval({
    apply: true,
    env: { NODE_ENV: "production" },
  }), /CONFIRM_PRODUCTION_LICENSE_CONFIGURATION/);
  assert.throws(() => requireProductionApplyApproval({
    apply: true,
    env: {
      NODE_ENV: "production",
      CONFIRM_PRODUCTION_LICENSE_CONFIGURATION: APPLY_CONFIRMATION,
    },
  }), /PRODUCTION_LICENSE_CONFIGURATION_VERSION/);
  assert.doesNotThrow(() => requireProductionApplyApproval({
    apply: true,
    env: {
      NODE_ENV: "production",
      CONFIRM_PRODUCTION_LICENSE_CONFIGURATION: APPLY_CONFIRMATION,
      PRODUCTION_LICENSE_CONFIGURATION_VERSION: manifest.version,
    },
  }));
});

test("plan summaries expose blocked state and capacity without sensitive configuration", () => {
  const summary = summarizePlan({
    name: "Picor",
    status: "no_change",
    next: { adminLimit: null },
    capacity: { allocatedAdministrators: 2, allocatedUsers: 5, properties: 10 },
  });
  assert.match(summary, /Managed Service, unmetered/);
  assert.match(summary, /2 admins, 5 users, 10 properties/);

  const historical = summarizePlan({
    name: "AzRoots",
    status: "historical_not_ready",
    blockers: {
      activeOrganizationUsers: 4,
      pendingInvitations: 0,
      activeResourceDeployments: 0,
    },
    capacity: { properties: 5 },
  });
  assert.match(historical, /historical retention requires live access to be retired/);
  assert.match(historical, /active organization users: 4/);
});
