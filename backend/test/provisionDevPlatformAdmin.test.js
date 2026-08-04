const test = require("node:test");
const assert = require("node:assert/strict");
const {
  EXPECTED_EMAIL,
  provisionDevPlatformAdmin,
  requireExplicitDevApproval,
} = require("../scripts/provisionDevPlatformAdmin");

test("DEV platform provisioning requires an explicit runtime approval", () => {
  assert.throws(() => requireExplicitDevApproval({}), /ALLOW_DEV_PLATFORM_ADMIN_PROVISIONING/);
  assert.doesNotThrow(() => requireExplicitDevApproval({
    ALLOW_DEV_PLATFORM_ADMIN_PROVISIONING: "true",
  }));
});

test("DEV provisioning is restricted to the approved Afterlight email", async () => {
  await assert.rejects(
    provisionDevPlatformAdmin({ email: "other@example.com" }),
    /restricted/
  );
});

test("an existing DEV user is promoted and their sessions are revoked", async () => {
  let saved = false;
  let revokedQuery;
  const existing = {
    _id: "user-1",
    email: EXPECTED_EMAIL,
    tokenVersion: 2,
    save: async () => { saved = true; },
  };
  const result = await provisionDevPlatformAdmin({
    UserModel: {
      findOne: async () => existing,
    },
    RefreshSessionModel: {
      updateMany: async (query) => { revokedQuery = query; },
    },
  });
  assert.equal(result.created, false);
  assert.equal(existing.platformRole, "platform_admin");
  assert.equal(existing.tokenVersion, 3);
  assert.equal(saved, true);
  assert.equal(revokedQuery.userId, "user-1");
});

test("a new DEV platform admin receives a discarded random bootstrap credential", async () => {
  let created;
  const result = await provisionDevPlatformAdmin({
    UserModel: {
      findOne: async () => null,
      create: async (record) => {
        created = { _id: "user-2", ...record };
        return created;
      },
    },
    ensureOrganization: async () => ({ _id: "workforce-org" }),
  });
  assert.equal(result.created, true);
  assert.equal(created.email, EXPECTED_EMAIL);
  assert.equal(created.platformRole, "platform_admin");
  assert.equal(created.organizationId, "workforce-org");
  assert.match(created.password, /^\$2[aby]\$/);
  assert.equal(Object.hasOwn(created, "resetPasswordToken"), false);
});
