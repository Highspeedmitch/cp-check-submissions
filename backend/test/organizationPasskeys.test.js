const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const {
  issueGrant,
  consumeGrant,
} = require("../services/organizationPasskeys");

test("configured organization passkeys issue short-lived scoped grants", async () => {
  let created;
  const passkey = "organization-passphrase";
  const organization = {
    _id: "org-1",
    security: {
      adminActionPasskeyHash: await bcrypt.hash(passkey, 4),
      adminActionPasskeyVersion: 3,
    },
  };
  const token = await issueGrant({
    organization,
    userId: "admin-1",
    purpose: "add_property",
    passkey,
    GrantModel: {
      async create(record) {
        created = record;
      },
    },
  });

  assert.ok(token);
  assert.equal(created.organizationId, "org-1");
  assert.equal(created.userId, "admin-1");
  assert.equal(created.purpose, "add_property");
  assert.equal(created.passkeyVersion, 3);
  assert.notEqual(created.tokenHash, token);
});

test("incorrect organization passkeys do not create grants", async () => {
  const organization = {
    _id: "org-1",
    security: {
      adminActionPasskeyHash: await bcrypt.hash("correct-passphrase", 4),
      adminActionPasskeyVersion: 1,
    },
  };
  const token = await issueGrant({
    organization,
    userId: "admin-1",
    purpose: "remove_property",
    passkey: "incorrect-passphrase",
    GrantModel: {
      async create() {
        assert.fail("a grant should not be created");
      },
    },
  });
  assert.equal(token, null);
});

test("grant consumption is tenant, user, purpose, version, and one-time scoped", async () => {
  let query;
  let update;
  const accepted = await consumeGrant({
    organization: {
      _id: "org-1",
      security: { adminActionPasskeyVersion: 7 },
    },
    userId: "admin-1",
    purpose: "remove_property",
    token: "opaque-token",
    GrantModel: {
      async findOneAndUpdate(receivedQuery, receivedUpdate) {
        query = receivedQuery;
        update = receivedUpdate;
        return { _id: "grant-1" };
      },
    },
  });

  assert.equal(accepted, true);
  assert.equal(query.organizationId, "org-1");
  assert.equal(query.userId, "admin-1");
  assert.equal(query.purpose, "remove_property");
  assert.equal(query.passkeyVersion, 7);
  assert.equal(query.consumedAt, null);
  assert.ok(query.expiresAt.$gt instanceof Date);
  assert.ok(update.$set.consumedAt instanceof Date);
});
