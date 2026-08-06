const express = require("express");
const crypto = require("crypto");
const { buildFrontendUrl } = require("../utils/frontendUrls");
const Organization = require("../models/organization");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const Assignment = require("../models/assignment");
const Submission = require("../models/submission");
const PlatformAudit = require("../models/platformAudit");
const OrganizationInvitation = require("../models/organizationInvitation");
const {
  normalizeAccountStatus,
  isValidAccountStatus,
} = require("../utils/accountStatus");
const { revokeUserSessions } = require("../services/authSessions");
const { sendSystemEmail } = require("../services/systemEmail");
const {
  archiveOrganizationUser,
  restoreOrganizationUser,
} = require("../services/directoryArchival");
const {
  ORGANIZATION_INVITE_ROLES,
  resendInvitation,
  expireInvitations,
} = require("../services/organizationInvitations");
const { withoutAutomaticPropertyEmails } = require("../services/propertyEmails");
const {
  LICENSE_TIERS,
  TIER_LIMITS,
  HYBRID_PORTFOLIO_MINIMUMS,
  resolveLicenseEntitlements,
  summarizeAdminSeats,
} = require("../services/licenseEntitlements");
const { createLicensedAdminInvitations } = require("../services/licensedAdminInvitations");
const { createLicensedOrganizationInvitation } = require("../services/licensedOrganizationInvitations");
const { currentLicenseCapacity } = require("../services/licenseCapacity");
const { licensedCapacityErrorBody } = require("../services/licensedCapacityOperations");
const { notifyPlatformAdministrators } = require("../services/notifications");
const { administratorLicenseRequested } = require("../services/notificationEvents");

const router = express.Router();
const editableRoles = ["user", "property_manager", "client", "contractor", "cleaner"];

router.use((req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  next();
});

router.get("/", async (req, res) => {
  await expireInvitations({ organizationId: req.user.organizationId });
  const directory = req.query.directory === "archived" ? "archived" : "current";
  const search = String(req.query.search || "").trim().slice(0, 100);
  const userQuery = {
    organizationId: req.user.organizationId,
    role: { $in: editableRoles },
    organizationArchivedAt: directory === "archived" ? { $ne: null } : null,
  };
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    userQuery.$or = [
      { username: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
      { role: { $regex: escaped, $options: "i" } },
    ];
  }
  const [organization, users, invitations, administrators, adminInvitations] = await Promise.all([
    Organization.findById(req.user.organizationId).lean(),
    User.find(userQuery)
      .select("username email role accountStatus tokenVersion organizationArchivedAt organizationArchivedBy organizationArchiveReason")
      .sort({ username: 1 }).lean(),
    OrganizationInvitation.find({
      organizationId: req.user.organizationId,
      role: { $ne: "admin" },
      status: { $in: ["pending", "expired"] },
    }).select("email role propertyIds status expiresAt lastSentAt createdAt")
      .sort({ createdAt: -1 }).lean(),
    User.find({
      organizationId: req.user.organizationId,
      role: "admin",
      organizationArchivedAt: null,
    }).select("username email role accountStatus createdAt").sort({ username: 1 }).lean(),
    OrganizationInvitation.find({
      organizationId: req.user.organizationId,
      role: "admin",
      status: { $in: ["pending", "expired"] },
    }).select("email role status expiresAt lastSentAt createdAt invitedBy")
      .sort({ createdAt: -1 }).lean(),
  ]);
  if (!organization) return res.status(404).json({ error: "Organization not found." });
  const capacity = await currentLicenseCapacity({ organization });
  const usersWithStats = directory === "archived"
    ? await Promise.all(users.map(async (user) => {
        const [submissionCount, assignmentCount] = await Promise.all([
          Submission.countDocuments({ organizationId: req.user.organizationId, userId: user._id }),
          Assignment.countDocuments({ organizationId: req.user.organizationId, userId: user._id }),
        ]);
        return { ...user, submissionCount, assignmentCount };
      }))
    : users;
  res.json({
    users: usersWithStats,
    invitations,
    administrators,
    adminInvitations,
    adminSeats: summarizeAdminSeats({ organization, administrators, invitations: adminInvitations }),
    capacity,
    license: resolveLicenseEntitlements(organization),
    licenseOptions: {
      tiers: LICENSE_TIERS,
      tierLimits: TIER_LIMITS,
      hybridPortfolioMinimums: HYBRID_PORTFOLIO_MINIMUMS,
    },
    properties: organization.properties.map((property) => ({
      _id: property._id,
      name: property.name,
      propertyManagers: property.propertyManagers || [],
      clientOwners: property.clientOwners || [],
    })),
  });
});

router.post("/admin-invitations", async (req, res) => {
  if (req.user.assumedOrganization) {
    return res.status(403).json({ error: "Administrator invitations cannot be issued through assumed access." });
  }
  try {
    const result = await createLicensedAdminInvitations({
      organizationId: req.user.organizationId,
      invitedBy: req.user.userId,
      emails: req.body.emails || req.body.email,
      adminActionGrant: req.body.adminActionGrant,
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    return res.status(201).json({
      ...result,
      message: result.delivered
        ? `${result.invitations.length === 1 ? "Administrator invitation" : "Administrator invitations"} sent.`
        : "The administrator seat was reserved, but one or more emails could not be delivered. Resend from the pending list.",
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "A pending invitation already exists for that email address." });
    }
    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.adminSeats ? { adminSeats: error.adminSeats } : {}),
      });
    }
    if (/valid invitation|already belongs|archived user/i.test(error.message || "")) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Administrator invitation creation error:", error.message);
    return res.status(500).json({ error: "Unable to create the administrator invitation." });
  }
});

router.post("/admin-license-requests", async (req, res) => {
  if (req.user.assumedOrganization) {
    return res.status(403).json({ error: "License requests cannot be issued through assumed access." });
  }
  try {
    await expireInvitations({ organizationId: req.user.organizationId });
    const duplicateWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [organization, administrators, adminInvitations, recentRequest] = await Promise.all([
      Organization.findById(req.user.organizationId).lean(),
      User.find({
        organizationId: req.user.organizationId,
        role: "admin",
        organizationArchivedAt: null,
      }).select("role accountStatus organizationArchivedAt").lean(),
      OrganizationInvitation.find({
        organizationId: req.user.organizationId,
        role: "admin",
        status: "pending",
      }).select("role status expiresAt").lean(),
      PlatformAudit.findOne({
        action: "organization_admin_license_requested",
        targetOrganizationId: req.user.organizationId,
        createdAt: { $gte: duplicateWindowStart },
      }).select("_id createdAt").lean(),
    ]);
    if (!organization) return res.status(404).json({ error: "Organization not found." });
    const adminSeats = summarizeAdminSeats({ organization, administrators, invitations: adminInvitations });
    if (adminSeats.unmetered) {
      return res.status(400).json({ error: "Managed-service administrator seats are not metered." });
    }
    if (adminSeats.remaining > 0) {
      return res.status(409).json({ error: "This organization still has an available administrator seat." });
    }
    if (recentRequest) {
      return res.status(409).json({
        code: "ADMIN_LICENSE_REQUEST_EXISTS",
        error: "An administrator license request was already submitted in the last 24 hours.",
      });
    }

    const request = await PlatformAudit.create({
      actorUserId: req.user.userId,
      action: "organization_admin_license_requested",
      targetOrganizationId: organization._id,
      metadata: {
        licenseTier: adminSeats.tier,
        adminSeatLimit: adminSeats.limit,
        adminSeatsAllocated: adminSeats.allocated,
      },
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    let platformNotified = true;
    try {
      await notifyPlatformAdministrators({
        event: administratorLicenseRequested(request, organization.name, adminSeats),
        contextOrganizationId: organization._id,
      });
    } catch (notificationError) {
      platformNotified = false;
      console.error("Administrator license request notification error:", notificationError.message);
    }
    return res.status(201).json({
      requestId: request._id,
      platformNotified,
      message: platformNotified
        ? "Additional administrator licensing requested. Afterlight platform administration was notified."
        : "Additional administrator licensing requested and recorded for platform review.",
    });
  } catch (error) {
    console.error("Administrator license request error:", error.message);
    return res.status(500).json({ error: "Unable to request additional administrator licensing." });
  }
});

function archivalError(res, error, fallback) {
  return res.status(error.status || 500).json({
    error: error.status ? error.message : fallback,
    ...(error.code ? { code: error.code } : {}),
    ...(error.scheduledAssignments ? { scheduledAssignments: error.scheduledAssignments } : {}),
    ...(error.capacity ? { capacity: error.capacity } : {}),
  });
}

router.post("/:userId/archive", async (req, res) => {
  try {
    const result = await archiveOrganizationUser({
      organizationId: req.user.organizationId,
      userId: req.params.userId,
      actorUserId: req.user.userId,
      reason: req.body.reason,
    });
    return res.json({
      message: "User archived. Their organization access and current property assignments were removed.",
      userId: result.user._id,
      removedPropertyIds: result.removedPropertyIds,
    });
  } catch (error) {
    console.error("User archive error:", error.message);
    return archivalError(res, error, "Unable to archive the user.");
  }
});

router.post("/:userId/restore", async (req, res) => {
  try {
    const result = await restoreOrganizationUser({
      organizationId: req.user.organizationId,
      userId: req.params.userId,
      actorUserId: req.user.userId,
    });
    return res.json({
      message: result.user.accountStatus === "inactive"
        ? "User restored to the current directory. Their account remains inactive."
        : "User restored to the current directory.",
      userId: result.user._id,
      accountStatus: result.user.accountStatus,
    });
  } catch (error) {
    console.error("User restore error:", error.message);
    return archivalError(res, error, "Unable to restore the user.");
  }
});

router.post("/invitations", async (req, res) => {
  try {
    const role = String(req.body.role || "");
    if (!ORGANIZATION_INVITE_ROLES.has(role)) {
      return res.status(400).json({ error: "Select a valid invitation role." });
    }
    const result = await createLicensedOrganizationInvitation({
      organizationId: req.user.organizationId,
      email: req.body.email,
      role,
      propertyIds: req.body.propertyIds || [],
      invitedBy: req.user.userId,
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
      capacity: result.capacity,
      message: result.delivered
        ? "Invitation sent."
        : "Invitation created, but email delivery failed. You can resend it from the pending list.",
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "A pending invitation already exists for that email address." });
    }
    if (error.status) {
      return res.status(error.status).json(licensedCapacityErrorBody(error, "Unable to create the invitation."));
    }
    if (/valid invitation|already belongs|archived user|Administrator invitations/i.test(error.message || "")) {
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
    if (invitation.role === "admin" && invitation.status === "expired") {
      return res.status(409).json({
        code: "ADMIN_INVITATION_EXPIRED",
        error: "Revoke this expired administrator invitation and issue a new passkey-authorized invitation.",
      });
    }
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
      organizationArchivedAt: null,
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
    const additionalSeats = user.accountStatus === "inactive" && normalizedAccountStatus !== "inactive" ? 1 : 0;
    const result = await reserveLicensedCapacity({
      organizationId: req.user.organizationId,
      dimension: "users",
      additional: additionalSeats,
      actorUserId: req.user.userId,
      work: async ({ organization: currentOrganization, session }) => {
        const currentUser = await User.findOne({
          _id: user._id,
          organizationId: req.user.organizationId,
          role: { $ne: "admin" },
          organizationArchivedAt: null,
        }).session(session);
        if (!currentUser) {
          const notFound = new Error("Editable user not found.");
          notFound.status = 404;
          notFound.code = "USER_NOT_FOUND";
          throw notFound;
        }
        currentOrganization.properties.forEach((property) => {
          property.propertyManagers = (property.propertyManagers || [])
            .filter((id) => id.toString() !== currentUser._id.toString());
          property.clientOwners = (property.clientOwners || [])
            .filter((id) => id.toString() !== currentUser._id.toString());
          if (assignedIds.has(property._id.toString())) {
            const assignmentField = role === "client" ? "clientOwners" : "propertyManagers";
            property[assignmentField].push(currentUser._id);
            if (role === "property_manager") {
              property.emails = withoutAutomaticPropertyEmails(property.emails, [email]);
            }
          }
        });
        currentUser.username = username.trim();
        currentUser.email = email.trim().toLowerCase();
        currentUser.role = role;
        currentUser.accountStatus = normalizedAccountStatus;
        currentUser.tokenVersion = (currentUser.tokenVersion || 0) + 1;
        await currentUser.save({ session });
        await UserAudit.create([{
          organizationId: req.user.organizationId,
          targetUserId: currentUser._id,
          changedBy: req.user.userId,
          action: "user_updated",
          changes: {
            before,
            after: {
              username: currentUser.username,
              email: currentUser.email,
              role,
              accountStatus: normalizedAccountStatus,
            },
            propertyIds: [...assignedIds],
          },
        }], { session });
        return currentUser;
      },
    });
    await revokeUserSessions(result.value._id);
    res.json({
      success: true,
      user: result.value,
      capacity: await currentLicenseCapacity({ organization: result.organization }),
    });
  } catch (error) {
    console.error("User management update error:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ error: "That email is already in use." });
    }
    res.status(error.status || 500).json(licensedCapacityErrorBody(error, "Unable to update user."));
  }
});

router.post("/:userId/send-password-reset", async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.userId,
      organizationId: req.user.organizationId,
      role: { $ne: "admin" },
      organizationArchivedAt: null,
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
