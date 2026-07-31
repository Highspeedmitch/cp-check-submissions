const express = require("express");
const crypto = require("crypto");
const { buildFrontendUrl } = require("../utils/frontendUrls");
const Organization = require("../models/organization");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const PlatformAudit = require("../models/platformAudit");
const OrganizationInvitation = require("../models/organizationInvitation");
const {
  normalizeAccountStatus,
  isValidAccountStatus,
} = require("../utils/accountStatus");
const { revokeUserSessions } = require("../services/authSessions");
const { sendSystemEmail } = require("../services/systemEmail");
const {
  ORGANIZATION_INVITE_ROLES,
  createInvitation,
  resendInvitation,
  expireInvitations,
} = require("../services/organizationInvitations");

const router = express.Router();
const editableRoles = ["user", "property_manager", "client", "contractor", "cleaner"];

router.use((req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  next();
});

router.get("/", async (req, res) => {
  await expireInvitations({ organizationId: req.user.organizationId });
  const [organization, users, invitations] = await Promise.all([
    Organization.findById(req.user.organizationId).lean(),
    User.find({
      organizationId: req.user.organizationId,
      role: { $in: editableRoles },
    }).select("username email role accountStatus tokenVersion").sort({ username: 1 }).lean(),
    OrganizationInvitation.find({
      organizationId: req.user.organizationId,
      status: { $in: ["pending", "expired"] },
    }).select("email role propertyIds status expiresAt lastSentAt createdAt")
      .sort({ createdAt: -1 }).lean(),
  ]);
  res.json({
    users,
    invitations,
    properties: organization.properties.map((property) => ({
      _id: property._id,
      name: property.name,
      propertyManagers: property.propertyManagers || [],
      clientOwners: property.clientOwners || [],
    })),
  });
});

router.post("/invitations", async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ error: "Organization not found." });
    const role = String(req.body.role || "");
    if (!ORGANIZATION_INVITE_ROLES.has(role)) {
      return res.status(400).json({ error: "Select a valid invitation role." });
    }
    const validPropertyIds = new Set(organization.properties.map((property) => String(property._id)));
    const propertyIds = ["property_manager", "client"].includes(role)
      ? [...new Set((req.body.propertyIds || []).map(String))]
      : [];
    if (propertyIds.some((id) => !validPropertyIds.has(id))) {
      return res.status(400).json({ error: "One or more selected properties are outside this organization." });
    }
    const result = await createInvitation({
      organization,
      email: req.body.email,
      role,
      propertyIds,
      invitedBy: req.user.userId,
      inviterScope: "organization",
    });
    await PlatformAudit.create({
      actorUserId: req.user.userId,
      action: "organization_invitation_created",
      targetOrganizationId: organization._id,
      metadata: { invitationId: result.invitation._id, email: result.invitation.email, role },
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    return res.status(201).json({
      invitation: {
        _id: result.invitation._id,
        email: result.invitation.email,
        role: result.invitation.role,
        propertyIds: result.invitation.propertyIds,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt,
        lastSentAt: result.invitation.lastSentAt,
      },
      delivered: result.delivered,
      message: result.delivered
        ? "Invitation sent."
        : "Invitation created, but email delivery failed. You can resend it from the pending list.",
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "A pending invitation already exists for that email address." });
    }
    if (/valid invitation|already belongs|Administrator invitations/i.test(error.message || "")) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Invitation creation error:", error.message);
    return res.status(500).json({ error: "Unable to create the invitation." });
  }
});

router.post("/invitations/:invitationId/resend", async (req, res) => {
  try {
    const [organization, invitation] = await Promise.all([
      Organization.findById(req.user.organizationId),
      OrganizationInvitation.findOne({
        _id: req.params.invitationId,
        organizationId: req.user.organizationId,
        status: { $in: ["pending", "expired"] },
      }).select("+tokenHash"),
    ]);
    if (!organization || !invitation) return res.status(404).json({ error: "Pending or expired invitation not found." });
    await resendInvitation({ invitation, organization });
    await PlatformAudit.create({
      actorUserId: req.user.userId,
      action: "organization_invitation_resent",
      targetOrganizationId: organization._id,
      metadata: { invitationId: invitation._id, email: invitation.email },
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    return res.json({ message: "Invitation resent.", expiresAt: invitation.expiresAt });
  } catch (error) {
    console.error("Invitation resend error:", error.message);
    return res.status(500).json({ error: "Unable to resend the invitation." });
  }
});

router.delete("/invitations/:invitationId", async (req, res) => {
  const invitation = await OrganizationInvitation.findOneAndUpdate({
    _id: req.params.invitationId,
    organizationId: req.user.organizationId,
    status: { $in: ["pending", "expired"] },
  }, { $set: { status: "revoked", revokedAt: new Date() } }, { new: true });
  if (!invitation) return res.status(404).json({ error: "Invitation not found." });
  await PlatformAudit.create({
    actorUserId: req.user.userId,
    action: "organization_invitation_revoked",
    targetOrganizationId: req.user.organizationId,
    metadata: { invitationId: invitation._id, email: invitation.email },
    ipAddress: req.ip || "",
    userAgent: req.get("user-agent") || "",
  });
  return res.status(204).end();
});

router.put("/:userId", async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.userId,
      organizationId: req.user.organizationId,
      role: { $ne: "admin" },
    });
    if (!user) return res.status(404).json({ error: "Editable user not found." });

    const { username, email, role, accountStatus, propertyIds = [] } = req.body;
    const normalizedAccountStatus = normalizeAccountStatus(accountStatus);
    if (!username?.trim() || !email?.trim()) {
      return res.status(400).json({ error: "Name and email are required." });
    }
    if (!editableRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role." });
    }
    if (!isValidAccountStatus(normalizedAccountStatus)) {
      return res.status(400).json({ error: "Invalid account status." });
    }
    const duplicate = await User.findOne({
      _id: { $ne: user._id },
      email: email.trim().toLowerCase(),
    });
    if (duplicate) return res.status(409).json({ error: "That email is already in use." });

    const organization = await Organization.findById(req.user.organizationId);
    const validPropertyIds = new Set(organization.properties.map((property) => property._id.toString()));
    const assignedIds = new Set(propertyIds.map(String));
    if ([...assignedIds].some((id) => !validPropertyIds.has(id))) {
      return res.status(400).json({ error: "One or more properties are outside this organization." });
    }
    if (!["property_manager", "client"].includes(role)) assignedIds.clear();

    const before = {
      username: user.username,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
    };
    organization.properties.forEach((property) => {
      property.propertyManagers = (property.propertyManagers || [])
        .filter((id) => id.toString() !== user._id.toString());
      property.clientOwners = (property.clientOwners || [])
        .filter((id) => id.toString() !== user._id.toString());
      if (assignedIds.has(property._id.toString())) {
        const assignmentField = role === "client" ? "clientOwners" : "propertyManagers";
        property[assignmentField].push(user._id);
      }
    });
    user.username = username.trim();
    user.email = email.trim().toLowerCase();
    user.role = role;
    user.accountStatus = normalizedAccountStatus;
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await Promise.all([
      organization.save(),
      user.save(),
      revokeUserSessions(user._id),
      UserAudit.create({
        organizationId: req.user.organizationId,
        targetUserId: user._id,
        changedBy: req.user.userId,
        action: "user_updated",
        changes: {
          before,
          after: {
            username: user.username,
            email: user.email,
            role,
            accountStatus: normalizedAccountStatus,
          },
          propertyIds: [...assignedIds],
        },
      }),
    ]);
    res.json({ success: true, user });
  } catch (error) {
    console.error("User management update error:", error);
    res.status(500).json({ error: "Unable to update user." });
  }
});

router.post("/:userId/send-password-reset", async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.userId,
      organizationId: req.user.organizationId,
      role: { $ne: "admin" },
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();
    await sendSystemEmail({
      to: user.email,
      subject: "Password Reset Request",
      text: `Click the link to reset your password: ${buildFrontendUrl(`/reset-password?token=${encodeURIComponent(resetToken)}`)}`,
    });
    await UserAudit.create({
      organizationId: req.user.organizationId,
      targetUserId: user._id,
      changedBy: req.user.userId,
      action: "password_reset_sent",
    });
    res.json({ message: "Password reset link sent." });
  } catch (error) {
    res.status(500).json({ error: "Unable to send password reset." });
  }
});

router.get("/:userId/audit", async (req, res) => {
  const audits = await UserAudit.find({
    organizationId: req.user.organizationId,
    targetUserId: req.params.userId,
  }).populate("changedBy", "username email").sort({ createdAt: -1 }).limit(50).lean();
  res.json(audits);
});

module.exports = router;
