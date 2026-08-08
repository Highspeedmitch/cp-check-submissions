const test = require("node:test");
const assert = require("node:assert/strict");
const {
  changeOrganizationAdministratorAccess,
} = require("../services/administratorAccess");

function thenable(value) {
  return {
    select() { return this; },
    session() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function dependencies({
  activeAdministratorCount = 2,
  targetOverrides = {},
  userSeatsRemaining = 3,
  grantAccepted = true,
} = {}) {
  const actor = {
    _id: "admin-actor",
    username: "Current Admin",
    email: "current@example.com",
    role: "admin",
    accountStatus: "active",
  };
  const target = {
    _id: "admin-target",
    username: "Departing Admin",
    email: "departing@example.com",
    role: "admin",
    engagementType: null,
    accountStatus: "active",
    platformRole: null,
    tokenVersion: 4,
    organizationArchivedAt: null,
    async save() {},
    ...targetOverrides,
  };
  const organization = {
    _id: "org-1",
    name: "Example Organization",
    license: { adminSeatVersion: 2, capacityVersion: 5 },
    properties: [
      { _id: "property-1", propertyManagers: [], clientOwners: [], emails: ["departing@example.com"] },
      { _id: "property-2", propertyManagers: [], clientOwners: [] },
    ],
    async save() {},
  };
  const userAudits = [];
  const platformAudits = [];
  const revoked = [];
  const notifications = [];
  const emails = [];
  const grants = [];
  const UserModel = {
    findOne(query) {
      if (String(query._id) === actor._id) return thenable(actor);
      if (String(query._id) === target._id) return thenable(target);
      return thenable(null);
    },
    countDocuments() {
      return Promise.resolve(activeAdministratorCount);
    },
    find() {
      return {
        select() { return this; },
        lean() { return Promise.resolve([{ _id: "admin-remaining" }]); },
      };
    },
  };
  const capacity = {
    administrators: { active: activeAdministratorCount, pending: 0, allocated: activeAdministratorCount, remaining: 2 },
    users: { active: 2, pending: 0, allocated: 2, remaining: userSeatsRemaining, unmetered: false },
    properties: { active: 2, allocated: 2, remaining: 8 },
  };
  return {
    actor,
    target,
    organization,
    userAudits,
    platformAudits,
    revoked,
    notifications,
    emails,
    grants,
    options: {
      OrganizationModel: { findById() { return thenable(organization); } },
      InvitationModel: {},
      UserModel,
      UserAuditModel: { async create(records) { userAudits.push(...records); } },
      PlatformAuditModel: { async create(records) { platformAudits.push(...records); } },
      async consumeAdminGrant(details) { grants.push(details); return grantAccepted; },
      async revokeSessions(userId) { revoked.push(userId); },
      async notifyUser(notification) { notifications.push(notification); },
      async sendEmail(message) { emails.push(message); },
      async capacityResolver() { return capacity; },
      async transactionRunner(work) { return work(null); },
    },
  };
}

test("an administrator can demote another administrator and retain scoped property access", async () => {
  const setup = dependencies();
  const result = await changeOrganizationAdministratorAccess({
    organizationId: "org-1",
    actorUserId: "admin-actor",
    targetUserId: "admin-target",
    disposition: "demote",
    targetRole: "property_manager",
    engagementType: "",
    propertyIds: ["property-1"],
    reason: "Role changed after team reorganization",
    adminActionGrant: "grant-token",
    ...setup.options,
  });

  assert.equal(result.disposition, "demote");
  assert.equal(setup.target.role, "property_manager");
  assert.equal(setup.target.engagementType, null);
  assert.equal(setup.target.tokenVersion, 5);
  assert.deepEqual(setup.organization.properties[0].propertyManagers, ["admin-target"]);
  assert.deepEqual(setup.organization.properties[0].emails, []);
  assert.equal(setup.grants[0].purpose, "remove_admin");
  assert.deepEqual(setup.revoked, ["admin-target"]);
  assert.equal(setup.userAudits[0].action, "organization_administrator_access_changed");
  assert.equal(setup.platformAudits[0].metadata.after.role, "property_manager");
  assert.equal(setup.notifications.length, 2);
  assert.equal(setup.emails.length, 1);
});

test("removing an administrator archives the identity and preserves a non-admin restore role", async () => {
  const setup = dependencies();
  const now = new Date("2026-08-07T20:00:00.000Z");
  const result = await changeOrganizationAdministratorAccess({
    organizationId: "org-1",
    actorUserId: "admin-actor",
    targetUserId: "admin-target",
    disposition: "archive",
    reason: "No longer employed by the organization",
    adminActionGrant: "grant-token",
    now,
    ...setup.options,
  });

  assert.equal(result.disposition, "archive");
  assert.equal(setup.target.role, "user");
  assert.equal(setup.target.engagementType, "customer_employee");
  assert.equal(setup.target.organizationArchivedAt, now);
  assert.equal(setup.target.organizationArchivedBy, "admin-actor");
  assert.equal(setup.target.organizationArchiveReason, "No longer employed by the organization");
  assert.equal(setup.userAudits[0].changes.after.disposition, "archive");
});

test("administrator access cannot be changed for the current administrator", async () => {
  await assert.rejects(
    changeOrganizationAdministratorAccess({
      organizationId: "org-1",
      actorUserId: "admin-actor",
      targetUserId: "admin-actor",
      disposition: "archive",
      reason: "Leaving",
      adminActionGrant: "grant-token",
    }),
    (error) => error.status === 409 && error.code === "ADMIN_SELF_REMOVAL"
  );
});

test("the last active administrator cannot be removed", async () => {
  const setup = dependencies({ activeAdministratorCount: 1 });
  await assert.rejects(
    changeOrganizationAdministratorAccess({
      organizationId: "org-1",
      actorUserId: "admin-actor",
      targetUserId: "admin-target",
      disposition: "archive",
      reason: "Leaving",
      adminActionGrant: "grant-token",
      ...setup.options,
    }),
    (error) => error.status === 409 && error.code === "LAST_ACTIVE_ADMIN"
  );
  assert.equal(setup.grants.length, 0);
});

test("platform administrator identities are protected from organization removal", async () => {
  const setup = dependencies({ targetOverrides: { platformRole: "platform_admin" } });
  await assert.rejects(
    changeOrganizationAdministratorAccess({
      organizationId: "org-1",
      actorUserId: "admin-actor",
      targetUserId: "admin-target",
      disposition: "archive",
      reason: "Incorrect request",
      adminActionGrant: "grant-token",
      ...setup.options,
    }),
    (error) => error.status === 409 && error.code === "PLATFORM_ADMIN_PROTECTED"
  );
});

test("demotion requires an available licensed user seat", async () => {
  const setup = dependencies({ userSeatsRemaining: 0 });
  await assert.rejects(
    changeOrganizationAdministratorAccess({
      organizationId: "org-1",
      actorUserId: "admin-actor",
      targetUserId: "admin-target",
      disposition: "demote",
      targetRole: "user",
      engagementType: "customer_employee",
      reason: "Moving to field operations",
      adminActionGrant: "grant-token",
      ...setup.options,
    }),
    (error) => error.status === 409 && error.code === "USER_LIMIT_REACHED"
  );
  assert.equal(setup.grants.length, 0);
});

test("administrator access changes require a valid single-use grant", async () => {
  const setup = dependencies({ grantAccepted: false });
  await assert.rejects(
    changeOrganizationAdministratorAccess({
      organizationId: "org-1",
      actorUserId: "admin-actor",
      targetUserId: "admin-target",
      disposition: "archive",
      reason: "Leaving",
      adminActionGrant: "expired-grant",
      ...setup.options,
    }),
    (error) => error.status === 403 && error.code === "ADMIN_GRANT_INVALID"
  );
});
