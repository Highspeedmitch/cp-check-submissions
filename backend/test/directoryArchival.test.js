const test = require("node:test");
const assert = require("node:assert/strict");
const {
  archiveOrganizationUser,
  archiveResourceProfile,
  restoreOrganizationUser,
  restoreResourceProfile,
} = require("../services/directoryArchival");

test("organization archival removes live property access while retaining the user identity", async () => {
  let audit;
  let revokedUserId;
  const user = {
    _id: "user-1",
    role: "property_manager",
    accountStatus: "active",
    tokenVersion: 3,
    save: async () => {},
  };
  const organization = {
    properties: [{
      _id: "property-1",
      propertyManagers: ["user-1", "user-2"],
      clientOwners: [],
    }],
    save: async () => {},
  };
  const now = new Date("2026-08-04T12:00:00Z");
  const result = await archiveOrganizationUser({
    organizationId: "org-1",
    userId: "user-1",
    actorUserId: "admin-1",
    reason: "Former employee",
    now,
    UserModel: { findOne: async () => user },
    OrganizationModel: { findById: async () => organization },
    AssignmentModel: { countDocuments: async () => 0 },
    UserAuditModel: { create: async (record) => { audit = record; } },
    revokeSessions: async (userId) => { revokedUserId = userId; },
  });

  assert.equal(result.user, user);
  assert.deepEqual(result.removedPropertyIds, ["property-1"]);
  assert.deepEqual(organization.properties[0].propertyManagers, ["user-2"]);
  assert.equal(user.organizationArchivedAt, now);
  assert.equal(user.organizationArchiveReason, "Former employee");
  assert.equal(user.tokenVersion, 4);
  assert.equal(revokedUserId, "user-1");
  assert.equal(audit.action, "user_archived");
});

test("organization archival blocks users who still own scheduled work", async () => {
  await assert.rejects(
    archiveOrganizationUser({
      organizationId: "org-1",
      userId: "user-1",
      actorUserId: "admin-1",
      reason: "Leaving the organization",
      UserModel: { findOne: async () => ({ _id: "user-1" }) },
      AssignmentModel: { countDocuments: async () => 2 },
    }),
    (error) => error.status === 409
      && error.code === "SCHEDULED_ASSIGNMENTS"
      && error.scheduledAssignments === 2
  );
});

test("restoring an organization user preserves their previous active or inactive status", async () => {
  let audit;
  const user = {
    _id: "user-1",
    accountStatus: "inactive",
    tokenVersion: 1,
    organizationArchivedAt: new Date("2026-08-01T00:00:00Z"),
    organizationArchiveReason: "Seasonal departure",
    save: async () => {},
  };
  await restoreOrganizationUser({
    organizationId: "org-1",
    userId: "user-1",
    actorUserId: "admin-1",
    UserModel: { findOne: async () => user },
    UserAuditModel: { create: async (record) => { audit = record; } },
    revokeSessions: async () => {},
  });
  assert.equal(user.organizationArchivedAt, null);
  assert.equal(user.organizationArchiveReason, "");
  assert.equal(user.accountStatus, "inactive");
  assert.equal(audit.action, "user_restored");
});

test("resource archival suspends access, pauses deployments, and retains financial records", async () => {
  let userUpdate;
  let audit;
  const profile = {
    _id: "resource-1",
    userId: "user-1",
    status: "active",
    availabilityStatus: "available",
    save: async () => {},
  };
  const result = await archiveResourceProfile({
    resourceId: "resource-1",
    actorUserId: "platform-1",
    reason: "Contract ended",
    ResourceProfileModel: { findOne: async () => profile },
    ResourceDeploymentModel: { updateMany: async () => ({ modifiedCount: 2 }) },
    AssignmentModel: { countDocuments: async () => 0 },
    UserModel: { updateOne: async (...args) => { userUpdate = args; } },
    PlatformAuditModel: { create: async (record) => { audit = record; } },
    revokeSessions: async () => {},
  });
  assert.equal(profile.status, "suspended");
  assert.equal(profile.availabilityStatus, "unavailable");
  assert.equal(profile.archiveReason, "Contract ended");
  assert.equal(result.pausedDeployments, 2);
  assert.deepEqual(userUpdate, [{ _id: "user-1" }, { $inc: { tokenVersion: 1 } }]);
  assert.equal(audit.action, "afterlight_resource_archived");
  assert.equal(audit.metadata.previousStatus, "active");
});

test("restoring a linked resource is intentionally safe and does not reactivate it", async () => {
  const profile = {
    _id: "resource-1",
    userId: "user-1",
    archivedAt: new Date("2026-08-01T00:00:00Z"),
    archiveReason: "Contract ended",
    status: "suspended",
    availabilityStatus: "unavailable",
    save: async () => {},
  };
  await restoreResourceProfile({
    resourceId: "resource-1",
    actorUserId: "platform-1",
    ResourceProfileModel: { findOne: async () => profile },
    PlatformAuditModel: { create: async () => {} },
  });
  assert.equal(profile.archivedAt, null);
  assert.equal(profile.status, "suspended");
  assert.equal(profile.availabilityStatus, "unavailable");
});
