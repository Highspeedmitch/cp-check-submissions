const express = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Organization = require("../models/organization");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const { issueGrant } = require("../services/organizationPasskeys");
const { oktaConfig } = require("../services/oktaAuth");

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
  res.json({
    configured: Boolean(organization.security?.adminActionPasskeyHash),
    version: organization.security?.adminActionPasskeyVersion || 0,
    rotatedAt: organization.security?.adminActionPasskeyRotatedAt || null,
    oktaConfigured: okta.configured,
    oktaEnforcementEnabled: okta.enforcementEnabled,
    requireMfaForAllUsers: Boolean(organization.security?.requireMfaForAllUsers),
    administratorsAlwaysRequireMfa: okta.configured && okta.enforcementEnabled,
  });
});

router.put("/mfa-policy", verificationLimiter, async (req, res) => {
  const okta = oktaConfig();
  if (!okta.configured || !okta.enforcementEnabled) {
    return res.status(503).json({
      error: "Okta enforcement must be enabled for this deployment before organization MFA can be changed.",
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
  organization.security.requireMfaForAllUsers = Boolean(req.body.requireMfaForAllUsers);
  await Promise.all([
    organization.save(),
    UserAudit.create({
      organizationId: organization._id,
      targetUserId: user._id,
      changedBy: user._id,
      action: "organization_mfa_policy_updated",
      changes: { requireMfaForAllUsers: organization.security.requireMfaForAllUsers },
    }),
  ]);
  res.json({
    oktaConfigured: true,
    requireMfaForAllUsers: organization.security.requireMfaForAllUsers,
    administratorsAlwaysRequireMfa: true,
  });
});

router.post("/grants", verificationLimiter, async (req, res) => {
  const purpose = String(req.body.purpose || "");
  if (!["add_property", "remove_property"].includes(purpose)) {
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
