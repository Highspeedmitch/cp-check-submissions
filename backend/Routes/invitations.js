const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const OrganizationInvitation = require("../models/organizationInvitation");
const Organization = require("../models/organization");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const ResourceProfile = require("../models/resourceProfile");
const { withoutAutomaticPropertyEmails } = require("../services/propertyEmails");
const { registrationLimiter } = require("../middleware/rateLimits");
const { hashInvitationToken, invitationRoleLabel } = require("../services/organizationInvitations");
const { inferredCustomerEngagementType } = require("../services/organizationUserClassification");

const router = express.Router();
router.use(registrationLimiter);

function invitationQuery(token) {
  return {
    tokenHash: hashInvitationToken(token),
    status: "pending",
    expiresAt: { $gt: new Date() },
  };
}

router.post("/resolve", async (req, res) => {
  const token = String(req.body.token || "");
  if (token.length < 32) return res.status(404).json({ error: "This invitation is invalid or expired." });
  const invitation = await OrganizationInvitation.findOne(invitationQuery(token))
    .populate("organizationId", "name orgType").lean();
  if (!invitation?.organizationId) {
    return res.status(404).json({ error: "This invitation is invalid or expired." });
  }
  const engagementType = (invitation.accountScope || "organization") === "organization"
    ? inferredCustomerEngagementType(invitation)
    : null;
  return res.json({
    email: invitation.email,
    role: invitation.role,
    engagementType,
    roleLabel: invitationRoleLabel(invitation.role, engagementType, invitation.accountScope),
    organizationName: invitation.organizationId.name,
    organizationType: invitation.organizationId.orgType,
    expiresAt: invitation.expiresAt,
    accountScope: invitation.accountScope || "organization",
  });
});

router.post("/accept", async (req, res) => {
  const token = String(req.body.token || "");
  const username = String(req.body.username || "").trim().replace(/\s+/g, " ");
  const password = String(req.body.password || "");
  if (token.length < 32) return res.status(404).json({ error: "This invitation is invalid or expired." });
  if (username.length < 2 || username.length > 100) {
    return res.status(400).json({ error: "Your name must be between 2 and 100 characters." });
  }
  if (password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: "Password must be between 10 and 128 characters." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const session = await mongoose.startSession();
  let createdUser;
  let acceptedOrganization;
  try {
    await session.withTransaction(async () => {
      const invitation = await OrganizationInvitation.findOneAndUpdate(
        invitationQuery(token),
        { $set: { status: "accepting" } },
        { new: true, session }
      );
      if (!invitation) throw Object.assign(new Error("This invitation is invalid or expired."), { statusCode: 404 });

      const existing = await User.findOne({ email: invitation.email }).session(session);
      if (existing) throw Object.assign(new Error("An account already exists for this email address."), { statusCode: 409 });
      const organization = await Organization.findById(invitation.organizationId).session(session);
      if (!organization) throw Object.assign(new Error("The invited organization is unavailable."), { statusCode: 404 });

      [createdUser] = await User.create([{
        username,
        email: invitation.email,
        password: passwordHash,
        organizationId: organization._id,
        role: invitation.role,
        engagementType: (invitation.accountScope || "organization") === "organization"
          ? inferredCustomerEngagementType(invitation)
          : null,
        accountScope: invitation.accountScope || "organization",
      }], { session });

      if (invitation.accountScope === "afterlight_resource") {
        const resource = await ResourceProfile.findOneAndUpdate(
          {
            email: invitation.email,
            invitationId: invitation._id,
            userId: null,
            archivedAt: null,
          },
          {
            $set: {
              userId: createdUser._id,
              status: "onboarding",
              updatedBy: invitation.invitedBy,
            },
          },
          { new: true, session }
        );
        if (!resource) {
          throw Object.assign(new Error("The resource profile for this invitation is unavailable."), { statusCode: 409 });
        }
      }

      const assignedIds = new Set((invitation.propertyIds || []).map(String));
      if (invitation.role === "property_manager" || invitation.role === "client") {
        organization.properties.forEach((property) => {
          if (!assignedIds.has(String(property._id))) return;
          const field = invitation.role === "client" ? "clientOwners" : "propertyManagers";
          property[field] = property[field] || [];
          if (!(property[field] || []).some((id) => String(id) === String(createdUser._id))) {
            property[field].push(createdUser._id);
          }
          if (invitation.role === "property_manager") {
            property.emails = withoutAutomaticPropertyEmails(
              property.emails,
              [createdUser.email]
            );
          }
        });
        await organization.save({ session });
      }

      if (invitation.role === "admin" && organization.onboarding) {
        organization.onboarding.status = "in_progress";
        organization.onboarding.administratorAcceptedAt = new Date();
        await organization.save({ session });
      }

      invitation.status = "accepted";
      invitation.acceptedAt = new Date();
      invitation.acceptedBy = createdUser._id;
      await invitation.save({ session });
      await UserAudit.create([{
        organizationId: organization._id,
        targetUserId: createdUser._id,
        changedBy: invitation.invitedBy,
        action: "invitation_accepted",
        changes: {
          role: invitation.role,
          engagementType: createdUser.engagementType,
          propertyIds: [...assignedIds],
        },
      }], { session });
      acceptedOrganization = organization;
    });
    return res.status(201).json({
      message: "Your Afterlight account has been created.",
      email: createdUser.email,
      role: createdUser.role,
      engagementType: createdUser.engagementType,
      organizationName: acceptedOrganization.name,
      accountScope: createdUser.accountScope,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "An account already exists for this email address." });
    }
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Unable to accept this invitation.",
    });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
