const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  ASSUMED_ACCESS_MS,
  STEP_UP_AUTHENTICATION_MS,
  createAssumedAccessResponse,
  hasRecentStepUpAuthentication,
} = require("../services/platformAccess");

test("assumed access is a short-lived admin token scoped to one organization", () => {
  const response = createAssumedAccessResponse({
    user: {
      _id: "507f1f77bcf86cd799439011",
      email: "platform@example.com",
      tokenVersion: 2,
    },
    organization: {
      _id: "507f191e810c19729de860ea",
      name: "Example Organization",
      orgType: "COM",
    },
    platformSessionId: "507f191e810c19729de860eb",
    secretKey: "test-secret",
  });
  const payload = jwt.verify(response.token, "test-secret");

  assert.equal(response.assumedOrganization, true);
  assert.equal(payload.role, "admin");
  assert.equal(payload.platformRole, "platform_admin");
  assert.equal(payload.organizationId, "507f191e810c19729de860ea");
  assert.ok((payload.exp - payload.iat) * 1000 <= ASSUMED_ACCESS_MS);
});

test("assumed access requires MFA completed within the last fifteen minutes", () => {
  const now = new Date("2026-08-04T18:00:00.000Z").getTime();
  assert.equal(hasRecentStepUpAuthentication(new Date(now), now), true);
  assert.equal(
    hasRecentStepUpAuthentication(new Date(now - STEP_UP_AUTHENTICATION_MS), now),
    true
  );
  assert.equal(
    hasRecentStepUpAuthentication(new Date(now - STEP_UP_AUTHENTICATION_MS - 1), now),
    false
  );
  assert.equal(hasRecentStepUpAuthentication(null, now), false);
  assert.equal(hasRecentStepUpAuthentication(new Date(now + 1000), now), true);
  assert.equal(hasRecentStepUpAuthentication(new Date(now + 60 * 1000 + 1), now), false);
});
