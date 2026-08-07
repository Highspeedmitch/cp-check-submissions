const test = require("node:test");
const assert = require("node:assert/strict");
const {
  REQUEST_ACTION,
  normalizeAssistanceRequest,
  requestBulkOnboardingAssistance,
} = require("../services/bulkOnboardingAssistance");

function queryResult(value) {
  return {
    select() { return this; },
    async lean() { return value; },
  };
}

test("assistance request input accepts context but never accepts CSV payload fields", () => {
  assert.deepEqual(normalizeAssistanceRequest({
    type: " Properties ",
    estimatedRows: "42",
    reason: "  Coordinate a new portfolio onboarding.  ",
    csv: "email,role\nperson@example.com,user",
  }), {
    type: "properties",
    estimatedRows: 42,
    reason: "Coordinate a new portfolio onboarding.",
  });
  assert.throws(
    () => normalizeAssistanceRequest({ type: "users", estimatedRows: 0, reason: "Enough context here" }),
    /whole number/
  );
});

test("records an auditable request with a capacity snapshot and notifies platform admins", async () => {
  let auditRecord;
  let notification;
  const organization = { _id: "org-1", name: "Example Org" };
  const result = await requestBulkOnboardingAssistance({
    organizationId: organization._id,
    actorUserId: "admin-1",
    input: { type: "users", estimatedRows: 20, reason: "Coordinate invitation file preparation." },
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    OrganizationModel: { async findById() { return organization; } },
    AuditModel: {
      findOne() { return queryResult(null); },
      async create(value) {
        auditRecord = value;
        return { ...value, _id: "audit-1" };
      },
    },
    capacityForOrganization: async () => ({
      serviceModel: "platform",
      tier: "tier_1",
      users: { allocated: 3, limit: 5, remaining: 2, unmetered: false },
      properties: { allocated: 2, limit: 10, remaining: 8, unmetered: false },
    }),
    notifyPlatform: async (value) => { notification = value; },
  });

  assert.equal(auditRecord.action, REQUEST_ACTION);
  assert.equal(auditRecord.metadata.type, "users");
  assert.equal(auditRecord.metadata.estimatedRows, 20);
  assert.equal(auditRecord.metadata.capacity.remaining, 2);
  assert.equal(Object.hasOwn(auditRecord.metadata, "csv"), false);
  assert.equal(notification.event.type, "bulk_onboarding_assistance_requested");
  assert.equal(notification.contextOrganizationId, organization._id);
  assert.equal(result.platformNotified, true);
});

test("prevents duplicate assistance requests for the same import type for 24 hours", async () => {
  await assert.rejects(
    requestBulkOnboardingAssistance({
      organizationId: "org-1",
      actorUserId: "admin-1",
      input: { type: "properties", reason: "Coordinate a property portfolio import." },
      OrganizationModel: { async findById() { return { _id: "org-1", name: "Example Org" }; } },
      AuditModel: {
        findOne() { return queryResult({ _id: "existing-request" }); },
      },
    }),
    (error) => error.status === 409 && error.code === "BULK_ONBOARDING_ASSISTANCE_REQUEST_EXISTS"
  );
});
