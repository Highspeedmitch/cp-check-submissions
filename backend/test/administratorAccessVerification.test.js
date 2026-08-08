const test = require("node:test");
const assert = require("node:assert/strict");
const {
  verifyAdministratorAccessChange,
} = require("../services/administratorAccessVerification");

function userModel(user, { modifiedCount = 1 } = {}) {
  return {
    findOne(query) {
      return {
        select(fields) {
          assert.equal(query.role, "admin");
          assert.match(fields, /totpSecretEncrypted/);
          return Promise.resolve(user);
        },
      };
    },
    async updateOne(query, update) {
      assert.equal(query._id, user?._id);
      assert.equal(update.$set["mfa.lastUsedCounter"], 42);
      return { modifiedCount };
    },
  };
}

const enrolledAdministrator = {
  _id: "admin-1",
  password: "password-hash",
  mfa: {
    totpEnabled: true,
    totpSecretEncrypted: "encrypted-secret",
    lastUsedCounter: 41,
  },
};

test("administrator access verification requires password and a fresh TOTP code", async () => {
  const now = new Date("2026-08-07T18:00:00.000Z");
  const user = await verifyAdministratorAccessChange({
    organizationId: "org-1",
    userId: "admin-1",
    currentPassword: "correct-password",
    code: "123456",
    now,
    UserModel: userModel(enrolledAdministrator),
    comparePassword: async (password, hash) => {
      assert.equal(password, "correct-password");
      assert.equal(hash, "password-hash");
      return true;
    },
    mfaConfiguration: { enabled: true },
    verifyCode: ({ encryptedSecret, code, lastUsedCounter }) => {
      assert.equal(encryptedSecret, "encrypted-secret");
      assert.equal(code, "123456");
      assert.equal(lastUsedCounter, 41);
      return { valid: true, counter: 42 };
    },
  });

  assert.equal(user._id, "admin-1");
});

test("administrator access verification fails closed when MFA is unavailable", async () => {
  await assert.rejects(
    verifyAdministratorAccessChange({
      organizationId: "org-1",
      userId: "admin-1",
      UserModel: userModel(enrolledAdministrator),
      mfaConfiguration: { enabled: false },
    }),
    (error) => error.status === 503 && error.code === "MFA_UNAVAILABLE"
  );
});

test("administrator access verification rejects an incorrect password", async () => {
  await assert.rejects(
    verifyAdministratorAccessChange({
      organizationId: "org-1",
      userId: "admin-1",
      currentPassword: "incorrect",
      UserModel: userModel(enrolledAdministrator),
      comparePassword: async () => false,
      mfaConfiguration: { enabled: true },
    }),
    (error) => error.status === 403 && error.code === "ACCOUNT_PASSWORD_INVALID"
  );
});

test("administrator access verification rejects reused TOTP counters", async () => {
  await assert.rejects(
    verifyAdministratorAccessChange({
      organizationId: "org-1",
      userId: "admin-1",
      currentPassword: "correct-password",
      code: "123456",
      UserModel: userModel(enrolledAdministrator, { modifiedCount: 0 }),
      comparePassword: async () => true,
      mfaConfiguration: { enabled: true },
      verifyCode: () => ({ valid: true, counter: 42 }),
    }),
    (error) => error.status === 409 && error.code === "MFA_CODE_REUSED"
  );
});
