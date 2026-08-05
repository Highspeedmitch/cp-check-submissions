const express = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Organization = require("../models/organization");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const RefreshSession = require("../models/refreshSession");
const { issueGrant } = require("../services/organizationPasskeys");
const { oktaConfig } = require("../services/oktaAuth");
const {
  config: totpConfig,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
} = require("../services/totpMfa");
const { revokeUserSessions } = require("../services/authSessions");

const router = express.Router();
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.userId),
  validate: false,
  message: { error: "Too many administrative verification attempts. Try again later." },
});

router.use((req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  if (req.user.assumedOrganization) {
    return res.status(403).json({ error: "Security settings cannot be changed through assumed access." });
  }
  next();
});

router.get("/", async (req, res) => {
  const organization = await Organization.findById(req.user.organizationId)
    .select("security").lean();
  if (!organization) return res.status(404).json({ error: "Organization not found." });
  const okta = oktaConfig();
  const totp = totpConfig();
  const user = await User.findById(req.user.userId)
    .select("mfa.totpEnabled mfa.enrolledAt mfa.lastVerifiedAt +mfa.recoveryCodeHashes").lean();
  res.json({
    configured: Boolean(organization.security?.adminActionPasskeyHash),
    version: organization.security?.adminActionPasskeyVersion || 0,
    rotatedAt: organization.security?.adminActionPasskeyRotatedAt || null,
    oktaConfigured: okta.configured,
    oktaEnforcementEnabled: okta.enforcementEnabled,
    requireMfaForAllUsers: Boolean(organization.security?.requireMfaForAllUsers),
    totpConfigured: totp.enabled,
    totpEnabled: Boolean(user?.mfa?.totpEnabled),
    totpEnrolledAt: user?.mfa?.enrolledAt || null,
    totpLastVerifiedAt: user?.mfa?.lastVerifiedAt || null,
    recoveryCodesRemaining: user?.mfa?.recoveryCodeHashes?.length || 0,
    administratorsAlwaysRequireMfa: totp.enabled,
  });
});

router.put("/mfa-policy", verificationLimiter, async (req, res) => {
  const totp = totpConfig();
  if (!totp.enabled) {
    return res.status(503).json({
      error: "Afterlight MFA must be enabled for this deployment before organization policy can be changed.",
    });
  }
  const currentPassword = String(req.body.currentPassword || "");
  const user = await User.findOne({
    _id: req.user.userId,
    organizationId: req.user.organizationId,
    role: "admin",
  });
  if (!user || !await bcrypt.compare(currentPassword, user.password)) {
    return res.status(403).json({ error: "Account password confirmation failed." });
  }
  const organization = await Organization.findById(req.user.organizationId);
  const previouslyRequiredForAll = Boolean(organization.security.requireMfaForAllUsers);
  organization.security.requireMfaForAllUsers = Boolean(req.body.requireMfaForAllUsers);
  const newlyRequiredForAll = !previouslyRequiredForAll
    && organization.security.requireMfaForAllUsers;
  await Promise.all([
    organization.save(),
    UserAudit.create({
      organizationId: organization._id,
      targetUserId: user._id,
      changedBy: user._id,
      action: "organization_mfa_policy_updated",
      changes: { requireMfaForAllUsers: organization.security.requireMfaForAllUsers },
    }),
    ...(newlyRequiredForAll ? [
      User.updateMany({
        organizationId: organization._id,
        _id: { $ne: user._id },
      }, { $inc: { tokenVersion: 1 } }),
      RefreshSession.updateMany({
        organizationId: organization._id,
        userId: { $ne: user._id },
        revokedAt: null,
      }, { $set: { revokedAt: new Date() } }),
    ] : []),
  ]);
  res.json({
    totpConfigured: true,
    requireMfaForAllUsers: organization.security.requireMfaForAllUsers,
    administratorsAlwaysRequireMfa: true,
  });
});

router.post("/totp/recovery-codes", verificationLimiter, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const user = await User.findOne({
    _id: req.user.userId,
    organizationId: req.user.organizationId,
    role: "admin",
  }).select("+mfa.totpSecretEncrypted +mfa.recoveryCodeHashes");
  if (!user || !await bcrypt.compare(currentPassword, user.password)) {
    return res.status(403).json({ error: "Account password confirmation failed." });
  }
  if (!user.mfa?.totpEnabled) return res.status(400).json({ error: "MFA is not enrolled." });
  const verification = verifyTotp({
    encryptedSecret: user.mfa.totpSecretEncrypted,
    code: req.body.code,
    lastUsedCounter: user.mfa.lastUsedCounter,
  });
  if (!verification.valid) {
    return res.status(403).json({ error: "A new valid authenticator code is required." });
  }
  const recovery = generateRecoveryCodes();
  const updated = await User.updateOne({
    _id: user._id,
    $or: [
      { "mfa.lastUsedCounter": null },
      { "mfa.lastUsedCounter": { $lt: verification.counter } },
    ],
  }, { $set: {
    "mfa.lastUsedCounter": verification.counter,
    "mfa.lastVerifiedAt": new Date(),
    "mfa.recoveryCodeHashes": recovery.hashes,
  } });
  if (!updated.modifiedCount) return res.status(409).json({ error: "That authenticator code was already used." });
  await UserAudit.create({
    organizationId: req.user.organizationId,
    targetUserId: user._id,
    changedBy: user._id,
    action: "totp_recovery_codes_regenerated",
    changes: { recoveryCodeCount: recovery.codes.length },
  });
  return res.json({ recoveryCodes: recovery.codes, recoveryCodesRemaining: recovery.codes.length });
});

router.post("/totp/reset", verificationLimiter, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const user = await User.findOne({
    _id: req.user.userId,
    organizationId: req.user.organizationId,
    role: "admin",
  }).select("+mfa.totpSecretEncrypted +mfa.recoveryCodeHashes");
  if (!user || !await bcrypt.compare(currentPassword, user.password)) {
    return res.status(403).json({ error: "Account password confirmation failed." });
  }
  const suppliedCode = String(req.body.code || "");
  const isRecoveryCode = user.mfa?.recoveryCodeHashes?.includes(hashRecoveryCode(suppliedCode));
  const verification = isRecoveryCode ? { valid: true } : verifyTotp({
    encryptedSecret: user.mfa?.totpSecretEncrypted,
    code: suppliedCode,
    lastUsedCounter: user.mfa?.lastUsedCounter,
  });
  if (!verification.valid) {
    return res.status(403).json({ error: "A valid authenticator or recovery code is required." });
  }
  user.mfa.totpEnabled = false;
  user.mfa.totpSecretEncrypted = "";
  user.mfa.enrolledAt = null;
  user.mfa.lastVerifiedAt = null;
  user.mfa.lastUsedCounter = null;
  user.mfa.recoveryCodeHashes = [];
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await Promise.all([
    user.save(),
    revokeUserSessions(user._id),
    UserAudit.create({
      organizationId: req.user.organizationId,
      targetUserId: user._id,
      changedBy: user._id,
      action: "totp_mfa_reset",
      changes: { requiresReenrollment: true },
    }),
  ]);
  return res.json({ success: true, message: "MFA reset. Sign in again to enroll a new authenticator." });
});

router.post("/grants", verificationLimiter, async (req, res) => {
  const purpose = String(req.body.purpose || "");
  if (!["add_property", "remove_property", "update_fulfillment_policy", "invite_admin"].includes(purpose)) {
    return res.status(400).json({ error: "Invalid administrative action." });
  }
  const organization = await Organization.findById(req.user.organizationId);
  if (!organization) return res.status(404).json({ error: "Organization not found." });
  const token = await issueGrant({
    organization,
    userId: req.user.userId,
    purpose,
    passkey: String(req.body.passkey || ""),
  });
  if (!token) return res.status(403).json({ error: "Administrative verification failed." });
  res.json({ grant: token, expiresInSeconds: 300 });
});

router.put("/passkey", verificationLimiter, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPasskey = String(req.body.newPasskey || "");
  if (newPasskey.length < 12) {
    return res.status(400).json({ error: "The new passkey must be at least 12 characters." });
  }
  const user = await User.findOne({
    _id: req.user.userId,
    organizationId: req.user.organizationId,
    role: "admin",
  });
  if (!user || !await bcrypt.compare(currentPassword, user.password)) {
    return res.status(403).json({ error: "Account password confirmation failed." });
  }
  const organization = await Organization.findById(req.user.organizationId);
  if (!organization) return res.status(404).json({ error: "Organization not found." });
  organization.security.adminActionPasskeyHash = await bcrypt.hash(newPasskey, 12);
  organization.security.adminActionPasskeyVersion =
    (organization.security.adminActionPasskeyVersion || 0) + 1;
  organization.security.adminActionPasskeyRotatedAt = new Date();
  organization.security.adminActionPasskeyRotatedBy = user._id;
  await Promise.all([
    organization.save(),
    UserAudit.create({
      organizationId: organization._id,
      targetUserId: user._id,
      changedBy: user._id,
      action: "organization_passkey_rotated",
      changes: { version: organization.security.adminActionPasskeyVersion },
    }),
  ]);
  res.json({
    configured: true,
    version: organization.security.adminActionPasskeyVersion,
    rotatedAt: organization.security.adminActionPasskeyRotatedAt,
  });
});

module.exports = router;
