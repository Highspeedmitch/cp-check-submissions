const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../config/productionOrganizationLicenses");
const {
  APPLY_CONFIRMATION,
  parseArguments,
  requireProductionApplyApproval,
  summarizePlan,
} = require("../scripts/retireProductionHistoricalOrganizationAccess");
const {
  HISTORICAL_ARCHIVE_REASON,
  historicalConfigurations,
  retireProductionHistoricalOrganizationAccess,
} = require("../services/productionHistoricalOrganizationRetirement");

function organization(name, id) {
  return {
    _id: id,
    name,
    workspaceType: "customer",
    properties: Array.from({ length: 5 }, (_, index) => ({ _id: `${id}-property-${index + 1}` })),
  };
}

function member(overrides = {}) {
  let saves = 0;
  let saveOptions;
  const value = {
    _id: overrides._id || "user-1",
    email: overrides.email || "user@example.com",
    role: overrides.role || "user",
    accountScope: overrides.accountScope || "organization",
    accountStatus: overrides.accountStatus || "active",
    tokenVersion: overrides.tokenVersion || 0,
    organizationArchivedAt: null,
    organizationArchivedBy: null,
    organizationArchiveReason: "",
    save: async (options) => {
      saves += 1;
      saveOptions = options;
    },
    ...overrides,
  };
  value.saved = () => ({ count: saves, options: saveOptions });
  return value;
}

function fixture({ organizations, membersByOrganization = {}, blockersByOrganization = {} }) {
  const queries = {
    assignments: [],
    assignmentUpdates: [],
    inspectionJobs: [],
    invitations: [],
    deployments: [],
    bids: [],
    invoices: [],
  };
  const countModel = (name, blockerKey) => ({
    countDocuments: (query) => {
      queries[name].push(query);
      return blockersByOrganization[String(query.organizationId)]?.[blockerKey] || 0;
    },
  });
  return {
    queries,
    OrganizationModel: { find: () => organizations },
    UserModel: {
      find: (query) => (membersByOrganization[String(query.organizationId)] || [])
        .filter((value) => value.organizationArchivedAt === null),
    },
    AssignmentModel: {
      countDocuments: (query) => {
        queries.assignments.push(query);
        const blockers = blockersByOrganization[String(query.organizationId)] || {};
        return query.endDate?.$lt
          ? blockers.staleScheduledAssignments || 0
          : blockers.scheduledAssignments || 0;
      },
      updateMany: async (query, update, options) => {
        queries.assignmentUpdates.push({ query, update, options });
        const count = blockersByOrganization[String(query.organizationId)]?.staleScheduledAssignments || 0;
        return { matchedCount: count, modifiedCount: count };
      },
    },
    InspectionJobModel: countModel("inspectionJobs", "activeInspectionJobs"),
    InvitationModel: countModel("invitations", "pendingInvitations"),
    ResourceDeploymentModel: countModel("deployments", "activeResourceDeployments"),
    BidRequestModel: countModel("bids", "pendingBidRequests"),
    InvoiceModel: countModel("invoices", "pendingInvoices"),
  };
}

function dependencies(value) {
  return {
    OrganizationModel: value.OrganizationModel,
    AssignmentModel: value.AssignmentModel,
    InspectionJobModel: value.InspectionJobModel,
    InvitationModel: value.InvitationModel,
    ResourceDeploymentModel: value.ResourceDeploymentModel,
    BidRequestModel: value.BidRequestModel,
    InvoiceModel: value.InvoiceModel,
    UserModel: value.UserModel,
  };
}

test("historical access retirement targets only the three reviewed legacy organizations", () => {
  assert.equal(
    manifest.historicalAccessRetirementVersion,
    "2026-08-06-historical-access-retirement-v2"
  );
  assert.deepEqual(
    historicalConfigurations(manifest.organizations).map((entry) => entry.name),
    ["AzRoots", "HSLD", "Breezykeyzy"]
  );
});

test("dry run inventories memberships and all workflow blockers without changing access", async () => {
  const organizations = [
    organization("AzRoots", "org-az"),
    organization("HSLD", "org-hsld"),
    organization("breezykeyzy", "org-breezy"),
  ];
  const azAdmin = member({ _id: "az-admin", email: "az-admin@example.com", role: "admin" });
  const value = fixture({
    organizations,
    membersByOrganization: {
      "org-az": [azAdmin],
      "org-hsld": [member({ _id: "hsld-user" })],
      "org-breezy": [member({ _id: "breezy-user" })],
    },
  });

  const plans = await retireProductionHistoricalOrganizationAccess({
    configurations: manifest.organizations,
    retirementVersion: manifest.historicalAccessRetirementVersion,
    actorUserId: "platform-admin",
    apply: false,
    ...dependencies(value),
    RefreshSessionModel: { updateMany: async () => assert.fail("unexpected session change") },
    UserAuditModel: { create: async () => assert.fail("unexpected user audit") },
    PlatformAuditModel: { create: async () => assert.fail("unexpected platform audit") },
  });

  assert.deepEqual(plans.map((plan) => plan.status), ["ready", "ready", "ready"]);
  assert.equal(plans[0].members[0].role, "admin");
  assert.equal(azAdmin.organizationArchivedAt, null);
  assert.equal(azAdmin.saved().count, 0);
  assert.deepEqual(value.queries.assignments[0].status, "scheduled");
  assert.deepEqual(value.queries.assignments[0].endDate, { $gte: value.queries.assignments[1].endDate.$lt });
  assert.deepEqual(value.queries.inspectionJobs[0].status.$in, ["uploading", "queued", "processing"]);
  assert.deepEqual(value.queries.invitations[0].status.$in, ["pending", "accepting"]);
  assert.deepEqual(value.queries.deployments[0].status.$in, ["active", "paused"]);
  assert.deepEqual(value.queries.invoices[0].status.$in, ["pending_review", "approving", "failed"]);
});

test("any active workflow blocks the complete retirement before writes", async () => {
  const legacy = organization("AzRoots", "org-az");
  const user = member({ _id: "az-user" });
  const value = fixture({
    organizations: [legacy],
    membersByOrganization: { "org-az": [user] },
    blockersByOrganization: {
      "org-az": { scheduledAssignments: 1, pendingInvoices: 1 },
    },
  });

  await assert.rejects(retireProductionHistoricalOrganizationAccess({
    configurations: [{ name: "AzRoots", disposition: "historical" }],
    retirementVersion: manifest.historicalAccessRetirementVersion,
    actorUserId: "platform-admin",
    apply: true,
    ...dependencies(value),
    RefreshSessionModel: { updateMany: async () => assert.fail("unexpected session change") },
    UserAuditModel: { create: async () => assert.fail("unexpected user audit") },
    PlatformAuditModel: { create: async () => assert.fail("unexpected platform audit") },
    transactionRunner: async () => assert.fail("transaction must not start"),
  }), /AzRoots \(blocked\)/);
  assert.equal(user.organizationArchivedAt, null);
  assert.equal(user.saved().count, 0);
});

test("past-due scheduled assignments are reconciled without blocking historical retirement", async () => {
  const legacy = organization("AzRoots", "org-az");
  const user = member({ _id: "az-user" });
  const value = fixture({
    organizations: [legacy],
    membersByOrganization: { "org-az": [user] },
    blockersByOrganization: {
      "org-az": { staleScheduledAssignments: 2 },
    },
  });
  const session = { id: "retirement-session" };
  const retiredAt = new Date("2026-08-06T15:00:00.000Z");
  const platformAudits = [];

  const plans = await retireProductionHistoricalOrganizationAccess({
    configurations: [{ name: "AzRoots", disposition: "historical" }],
    retirementVersion: manifest.historicalAccessRetirementVersion,
    actorUserId: "platform-admin",
    apply: true,
    ...dependencies(value),
    RefreshSessionModel: { updateMany: async () => ({ modifiedCount: 0 }) },
    UserAuditModel: { create: async () => [] },
    PlatformAuditModel: {
      create: async (records, options) => platformAudits.push({ records, options }),
    },
    now: () => retiredAt,
    transactionRunner: async (operation) => operation(session),
  });

  assert.equal(plans[0].status, "ready");
  assert.equal(plans[0].staleScheduledAssignments, 2);
  assert.equal(value.queries.assignmentUpdates.length, 1);
  assert.deepEqual(value.queries.assignmentUpdates[0], {
    query: {
      organizationId: "org-az",
      status: "scheduled",
      endDate: { $lt: retiredAt },
    },
    update: {
      $set: {
        status: "canceled",
        canceledAt: retiredAt,
        canceledBy: "platform-admin",
      },
      $inc: { calendarSequence: 1 },
    },
    options: { session },
  });
  assert.equal(platformAudits[0].records[0].metadata.canceledStaleAssignmentCount, 2);
});

test("apply archives administrator and user organization memberships while retaining their identities", async () => {
  const legacy = organization("AzRoots", "org-az");
  const admin = member({
    _id: "az-admin",
    email: "admin@example.com",
    role: "admin",
    tokenVersion: 4,
    platformRole: "platform_admin",
  });
  const dualUser = member({
    _id: "az-resource",
    email: "resource@example.com",
    accountScope: "afterlight_resource",
    tokenVersion: 2,
  });
  const value = fixture({
    organizations: [legacy],
    membersByOrganization: { "org-az": [admin, dualUser] },
  });
  const session = { id: "retirement-session" };
  const sessionUpdates = [];
  const userAudits = [];
  const platformAudits = [];
  const retiredAt = new Date("2026-08-06T15:00:00.000Z");

  const plans = await retireProductionHistoricalOrganizationAccess({
    configurations: [{ name: "AzRoots", disposition: "historical" }],
    retirementVersion: manifest.historicalAccessRetirementVersion,
    actorUserId: "platform-admin",
    apply: true,
    ...dependencies(value),
    RefreshSessionModel: {
      updateMany: async (...args) => sessionUpdates.push(args),
    },
    UserAuditModel: {
      create: async (records, options) => userAudits.push({ records, options }),
    },
    PlatformAuditModel: {
      create: async (records, options) => platformAudits.push({ records, options }),
    },
    now: () => retiredAt,
    transactionRunner: async (operation) => operation(session),
  });

  assert.equal(plans[0].status, "ready");
  for (const user of [admin, dualUser]) {
    assert.equal(user.organizationArchivedAt, retiredAt);
    assert.equal(user.organizationArchivedBy, "platform-admin");
    assert.equal(user.organizationArchiveReason, HISTORICAL_ARCHIVE_REASON);
    assert.deepEqual(user.saved(), { count: 1, options: { session } });
  }
  assert.equal(admin.tokenVersion, 5);
  assert.equal(admin.platformRole, "platform_admin");
  assert.equal(dualUser.tokenVersion, 3);
  assert.equal(dualUser.accountScope, "afterlight_resource");
  assert.equal(sessionUpdates.length, 2);
  assert.deepEqual(sessionUpdates[0][2], { session });
  assert.equal(userAudits[0].records.length, 2);
  assert.equal(userAudits[0].records[0].action, "user_archived");
  assert.equal(userAudits[0].records[0].changes.preservedPropertyAssignments, true);
  assert.equal(platformAudits[0].records[0].action, "production_historical_organization_access_retired");
  assert.equal(platformAudits[0].records[0].metadata.retiredMembershipCount, 2);
  assert.equal(platformAudits[0].records[0].metadata.canceledStaleAssignmentCount, 0);
  assert.equal(platformAudits[0].records[0].metadata.retainedPropertyCount, 5);
  assert.equal(platformAudits[0].records[0].metadata.retirementVersion, manifest.historicalAccessRetirementVersion);
});

test("retirement is idempotent after every organization membership is archived", async () => {
  const legacy = organization("AzRoots", "org-az");
  const archived = member({
    _id: "az-user",
    organizationArchivedAt: new Date("2026-08-06T15:00:00.000Z"),
  });
  const value = fixture({
    organizations: [legacy],
    membersByOrganization: { "org-az": [archived] },
  });
  const plans = await retireProductionHistoricalOrganizationAccess({
    configurations: [{ name: "AzRoots", disposition: "historical" }],
    retirementVersion: manifest.historicalAccessRetirementVersion,
    actorUserId: "platform-admin",
    apply: false,
    ...dependencies(value),
    RefreshSessionModel: { updateMany: async () => assert.fail("unexpected session change") },
    UserAuditModel: { create: async () => assert.fail("unexpected user audit") },
    PlatformAuditModel: { create: async () => assert.fail("unexpected platform audit") },
  });
  assert.equal(plans[0].status, "already_retired");
  assert.equal(plans[0].propertyCount, 5);
});

test("missing historical organizations block the entire retirement", async () => {
  const value = fixture({ organizations: [] });
  await assert.rejects(retireProductionHistoricalOrganizationAccess({
    configurations: [{ name: "AzRoots", disposition: "historical" }],
    retirementVersion: manifest.historicalAccessRetirementVersion,
    actorUserId: "platform-admin",
    apply: false,
    ...dependencies(value),
    RefreshSessionModel: {},
    UserAuditModel: {},
    PlatformAuditModel: {},
  }), /AzRoots \(missing\)/);
});

test("Production retirement apply requires environment, confirmation, and reviewed version", () => {
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
  }), /CONFIRM_PRODUCTION_HISTORICAL_RETIREMENT/);
  assert.throws(() => requireProductionApplyApproval({
    apply: true,
    env: {
      NODE_ENV: "production",
      CONFIRM_PRODUCTION_HISTORICAL_RETIREMENT: APPLY_CONFIRMATION,
    },
  }), /PRODUCTION_HISTORICAL_RETIREMENT_VERSION/);
  assert.doesNotThrow(() => requireProductionApplyApproval({
    apply: true,
    env: {
      NODE_ENV: "production",
      CONFIRM_PRODUCTION_HISTORICAL_RETIREMENT: APPLY_CONFIRMATION,
      PRODUCTION_HISTORICAL_RETIREMENT_VERSION: manifest.historicalAccessRetirementVersion,
    },
  }));
});

test("retirement summaries show members and blockers without exposing credentials", () => {
  const ready = summarizePlan({
    name: "AzRoots",
    status: "ready",
    propertyCount: 5,
    members: [{
      email: "admin@example.com",
      role: "admin",
      accountScope: "organization",
      accountStatus: "active",
    }],
    staleScheduledAssignments: 2,
  });
  assert.match(ready, /ready to retire 1 organization membership/);
  assert.match(ready, /past-due scheduled assignments to cancel: 2/);
  assert.match(ready, /admin@example.com \| admin/);

  const blocked = summarizePlan({
    name: "HSLD",
    status: "blocked",
    blockers: { scheduledAssignments: 1, pendingInvitations: 0 },
  });
  assert.match(blocked, /scheduledAssignments=1/);
});
