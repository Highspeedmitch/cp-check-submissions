const test = require("node:test");
const assert = require("node:assert/strict");
const {
  EXPECTED_OWNER_EMAIL,
  provisionDevOwnerResource,
  requireExplicitDevOwnerApproval,
} = require("../scripts/provisionDevOwnerResource");

test("DEV owner provisioning requires explicit runtime approval", () => {
  assert.throws(() => requireExplicitDevOwnerApproval({}), /ALLOW_DEV_OWNER_PROVISIONING/);
  assert.doesNotThrow(() => requireExplicitDevOwnerApproval({
    ALLOW_DEV_OWNER_PROVISIONING: "true",
  }));
});

test("DEV owner provisioning is restricted to the approved email", async () => {
  await assert.rejects(
    provisionDevOwnerResource({ email: "other@example.com" }),
    /restricted/
  );
});

test("an existing DEV account receives an active owner resource profile", async () => {
  let userSaved = false;
  let createdProfile;
  let revokedQuery;
  const user = {
    _id: "user-1",
    email: EXPECTED_OWNER_EMAIL,
    username: "Mitch",
    tokenVersion: 1,
    save: async () => { userSaved = true; },
  };
  const result = await provisionDevOwnerResource({
    UserModel: { findOne: async () => user },
    ResourceProfileModel: {
      findOne: async () => null,
      create: async (record) => {
        createdProfile = record;
        return { _id: "resource-1", ...record };
      },
    },
    RefreshSessionModel: {
      updateMany: async (query) => { revokedQuery = query; },
    },
  });

  assert.equal(result.created, true);
  assert.equal(createdProfile.email, EXPECTED_OWNER_EMAIL);
  assert.equal(createdProfile.resourceType, "owner");
  assert.equal(createdProfile.status, "active");
  assert.equal(createdProfile.defaultRateCents, 0);
  assert.equal(user.tokenVersion, 2);
  assert.equal(userSaved, true);
  assert.equal(revokedQuery.userId, "user-1");
});

test("existing owner profiles are updated idempotently", async () => {
  let profileSaved = false;
  const user = {
    _id: "user-1",
    username: "Mitch",
    tokenVersion: 0,
    save: async () => {},
  };
  const profile = {
    userId: "user-1",
    resourceType: "contractor",
    status: "onboarding",
    defaultRateCents: 22500,
    save: async () => { profileSaved = true; },
  };
  const result = await provisionDevOwnerResource({
    UserModel: { findOne: async () => user },
    ResourceProfileModel: { findOne: async () => profile },
    RefreshSessionModel: { updateMany: async () => {} },
  });
  assert.equal(result.created, false);
  assert.equal(profile.resourceType, "owner");
  assert.equal(profile.status, "active");
  assert.equal(profile.defaultRateCents, 0);
  assert.equal(profileSaved, true);
});
