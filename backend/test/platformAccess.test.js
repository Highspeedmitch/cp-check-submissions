const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  ASSUMED_ACCESS_MS,
  createAssumedAccessResponse,
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
