const bcrypt = require("bcryptjs");
const User = require("../models/user");
const { ORGANIZATION_ACCOUNT_SCOPE } = require("./licenseCapacity");
const { config: totpConfig, verifyTotp } = require("./totpMfa");

function operationError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function verifyAdministratorAccessChange({
  organizationId,
  userId,
  currentPassword,
  code,
  now = new Date(),
  UserModel = User,
  comparePassword = bcrypt.compare,
  mfaConfiguration = totpConfig(),
  verifyCode = verifyTotp,
}) {
  if (!mfaConfiguration.enabled) {
    throw operationError(
      "Afterlight MFA must be enabled before administrator access can be changed.",
      503,
      "MFA_UNAVAILABLE"
    );
  }

  let query = UserModel.findOne({
    _id: userId,
    organizationId,
    ...ORGANIZATION_ACCOUNT_SCOPE,
    role: "admin",
    accountStatus: { $ne: "inactive" },
    organizationArchivedAt: null,
  });
  if (typeof query.select === "function") {
    query = query.select("+mfa.totpSecretEncrypted +mfa.recoveryCodeHashes");
  }
  const user = await query;
  if (!user || !await comparePassword(String(currentPassword || ""), user.password)) {
    throw operationError(
      "Account password confirmation failed.",
      403,
      "ACCOUNT_PASSWORD_INVALID"
    );
  }
  if (!user.mfa?.totpEnabled || !user.mfa?.totpSecretEncrypted) {
    throw operationError(
      "Enroll an authenticator before changing administrator access.",
      409,
      "MFA_ENROLLMENT_REQUIRED"
    );
  }

  const verification = verifyCode({
    encryptedSecret: user.mfa.totpSecretEncrypted,
    code: String(code || ""),
    lastUsedCounter: user.mfa.lastUsedCounter,
  });
  if (!verification.valid) {
    throw operationError(
      "A new valid authenticator code is required.",
      403,
      "MFA_CODE_INVALID"
    );
  }

  const updated = await UserModel.updateOne({
    _id: user._id,
    organizationId,
    role: "admin",
    organizationArchivedAt: null,
    $and: [
      ORGANIZATION_ACCOUNT_SCOPE,
      { $or: [
        { "mfa.lastUsedCounter": null },
        { "mfa.lastUsedCounter": { $lt: verification.counter } },
      ] },
    ],
  }, { $set: {
    "mfa.lastUsedCounter": verification.counter,
    "mfa.lastVerifiedAt": now,
  } });
  if (!updated.modifiedCount) {
    throw operationError(
      "That authenticator code was already used.",
      409,
      "MFA_CODE_REUSED"
    );
  }
  return user;
}

module.exports = {
  operationError,
  verifyAdministratorAccessChange,
};
