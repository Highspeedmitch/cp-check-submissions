const test = require("node:test");
const assert = require("node:assert/strict");
const { getPlatformOrganizationMetrics } = require("../services/platformMetrics");

test("platform metrics merge grouped tenant counts without per-organization queries", async () => {
  const firstId = "507f191e810c19729de860ea";
  const secondId = "507f191e810c19729de860eb";
  let submissionPipeline;
  const result = await getPlatformOrganizationMetrics({
    OrganizationModel: {
      aggregate: async () => [
        {
          _id: firstId,
          name: "Alpha",
          orgType: "COM",
          propertyCount: 2,
          security: { adminActionPasskeyHash: "hash" },
          onboarding: { status: "in_progress" },
        },
        { _id: secondId, name: "Beta", orgType: "STR", propertyCount: 1 },
      ],
    },
    UserModel: { aggregate: async () => [{ _id: firstId, count: 3 }] },
    SubmissionModel: {
      aggregate: async (pipeline) => {
        submissionPipeline = pipeline;
        return [{ _id: secondId, count: 4 }];
      },
    },
    BidRequestModel: { aggregate: async () => [{ _id: firstId, count: 1 }] },
    InvoiceModel: { aggregate: async () => [{ _id: firstId, count: 2 }] },
    InvitationModel: { aggregate: async () => [{
      _id: secondId,
      invitationId: "507f191e810c19729de860ec",
      email: "admin@beta.example",
      expiresAt: new Date("2026-08-01T12:00:00.000Z"),
      status: "pending",
    }] },
    now: new Date("2026-07-29T12:00:00.000Z"),
  });

  assert.equal(result.summary.organizationCount, 2);
  assert.equal(result.summary.propertyCount, 3);
  assert.equal(result.summary.activeUserCount, 3);
  assert.equal(result.summary.recentSubmissionCount, 4);
  assert.equal(result.organizations[0].pendingBidCount, 1);
  assert.equal(result.organizations[0].onboarding.requiredComplete, 3);
  assert.equal(result.organizations[1].activeUserCount, 0);
  assert.equal(result.summary.pendingAdminInviteCount, 1);
  assert.equal(result.organizations[1].pendingAdminInvitation.email, "admin@beta.example");
  assert.equal(
    submissionPipeline[0].$match.submittedAt.$gte.toISOString(),
    "2026-06-29T12:00:00.000Z"
  );
});
