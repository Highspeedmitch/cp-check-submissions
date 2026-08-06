const Assignment = require("../models/assignment");
const Organization = require("../models/organization");
const PlatformAudit = require("../models/platformAudit");
const OrganizationInvitation = require("../models/organizationInvitation");
const ResourceDeployment = require("../models/resourceDeployment");
const ResourceProfile = require("../models/resourceProfile");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const { revokeUserSessions } = require("./authSessions");
const { withSession } = require("./licenseCapacity");
const { reserveLicensedCapacity } = require("./licensedCapacityOperations");

function operationError(message, status, code, details = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  Object.assign(error, details);
  return error;
}

function archiveReason(value) {
  const reason = String(value || "").trim().replace(/\s+/g, " ");
  if (reason.length < 3 || reason.length > 500) {
    throw operationError("Enter an archive reason between 3 and 500 characters.", 400, "INVALID_ARCHIVE_REASON");
  }
  return reason;
}

async function archiveOrganizationUser({
  organizationId,
  userId,
  actorUserId,
  reason: suppliedReason,
  now = new Date(),
  UserModel = User,
  OrganizationModel = Organization,
  AssignmentModel = Assignment,
  UserAuditModel = UserAudit,
  revokeSessions = revokeUserSessions,
}) {
  const reason = archiveReason(suppliedReason);
  const user = await UserModel.findOne({
    _id: userId,
    organizationId,
    role: { $ne: "admin" },
    organizationArchivedAt: null,
  });
  if (!user) throw operationError("Current organization user not found.", 404, "USER_NOT_FOUND");

  const scheduledAssignments = await AssignmentModel.countDocuments({
    organizationId,
    userId: user._id,
    status: "scheduled",
  });
  if (scheduledAssignments) {
    throw operationError(
      `Reassign or cancel ${scheduledAssignments} scheduled assignment${scheduledAssignments === 1 ? "" : "s"} before archiving this user.`,
      409,
      "SCHEDULED_ASSIGNMENTS",
      { scheduledAssignments }
    );
  }

  const organization = await OrganizationModel.findById(organizationId);
  if (!organization) throw operationError("Organization not found.", 404, "ORGANIZATION_NOT_FOUND");
  const removedPropertyIds = [];
  for (const property of organization.properties || []) {
    const managed = (property.propertyManagers || []).some((id) => String(id) === String(user._id));
    const owned = (property.clientOwners || []).some((id) => String(id) === String(user._id));
    if (managed || owned) removedPropertyIds.push(String(property._id));
    property.propertyManagers = (property.propertyManagers || [])
      .filter((id) => String(id) !== String(user._id));
    property.clientOwners = (property.clientOwners || [])
      .filter((id) => String(id) !== String(user._id));
  }

  user.organizationArchivedAt = now;
  user.organizationArchivedBy = actorUserId;
  user.organizationArchiveReason = reason;
  user.tokenVersion = (user.tokenVersion || 0) + 1;

  await Promise.all([
    organization.save(),
    user.save(),
    revokeSessions(user._id),
    UserAuditModel.create({
      organizationId,
      targetUserId: user._id,
      changedBy: actorUserId,
      action: "user_archived",
      changes: {
        reason,
        role: user.role,
        accountStatus: user.accountStatus,
        removedPropertyIds,
        archivedAt: now,
      },
    }),
  ]);
  return { user, removedPropertyIds };
}

async function restoreOrganizationUser({
  organizationId,
  userId,
  actorUserId,
  now = new Date(),
  UserModel = User,
  OrganizationModel = Organization,
  InvitationModel = OrganizationInvitation,
  UserAuditModel = UserAudit,
  revokeSessions = revokeUserSessions,
  reserveCapacity = reserveLicensedCapacity,
}) {
  const user = await UserModel.findOne({
    _id: userId,
    organizationId,
    role: { $ne: "admin" },
    organizationArchivedAt: { $ne: null },
  });
  if (!user) throw operationError("Archived organization user not found.", 404, "USER_NOT_FOUND");
  if (user.accountStatus !== "inactive") {
    const result = await reserveCapacity({
      organizationId,
      dimension: "users",
      additional: 1,
      actorUserId,
      now,
      OrganizationModel,
      capacityOptions: { UserModel, InvitationModel },
      work: async ({ session }) => {
        const currentUser = await withSession(UserModel.findOne({
          _id: userId,
          organizationId,
          role: { $ne: "admin" },
          organizationArchivedAt: { $ne: null },
        }), session);
        if (!currentUser) throw operationError("Archived organization user not found.", 404, "USER_NOT_FOUND");
        const archivedAt = currentUser.organizationArchivedAt;
        const archiveReasonValue = currentUser.organizationArchiveReason;
        currentUser.organizationArchivedAt = null;
        currentUser.organizationArchivedBy = null;
        currentUser.organizationArchiveReason = "";
        currentUser.tokenVersion = (currentUser.tokenVersion || 0) + 1;
        await currentUser.save({ session });
        await UserAuditModel.create([{
          organizationId,
          targetUserId: currentUser._id,
          changedBy: actorUserId,
          action: "user_restored",
          changes: {
            previousArchivedAt: archivedAt,
            previousArchiveReason: archiveReasonValue,
            restoredAt: now,
            accountStatus: currentUser.accountStatus,
          },
        }], { session });
        return currentUser;
      },
    });
    await revokeSessions(result.value._id);
    return { user: result.value };
  }
  const archivedAt = user.organizationArchivedAt;
  const archiveReasonValue = user.organizationArchiveReason;
  user.organizationArchivedAt = null;
  user.organizationArchivedBy = null;
  user.organizationArchiveReason = "";
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await Promise.all([
    user.save(),
    revokeSessions(user._id),
    UserAuditModel.create({
      organizationId,
      targetUserId: user._id,
      changedBy: actorUserId,
      action: "user_restored",
      changes: {
        previousArchivedAt: archivedAt,
        previousArchiveReason: archiveReasonValue,
        restoredAt: now,
        accountStatus: user.accountStatus,
      },
    }),
  ]);
  return { user };
}

async function archiveResourceProfile({
  resourceId,
  actorUserId,
  reason: suppliedReason,
  now = new Date(),
  ResourceProfileModel = ResourceProfile,
  ResourceDeploymentModel = ResourceDeployment,
  AssignmentModel = Assignment,
  UserModel = User,
  PlatformAuditModel = PlatformAudit,
  revokeSessions = revokeUserSessions,
}) {
  const reason = archiveReason(suppliedReason);
  const profile = await ResourceProfileModel.findOne({ _id: resourceId, archivedAt: null });
  if (!profile) throw operationError("Current resource profile not found.", 404, "RESOURCE_NOT_FOUND");
  const scheduledAssignments = await AssignmentModel.countDocuments({
    resourceProfileId: profile._id,
    status: "scheduled",
  });
  if (scheduledAssignments) {
    throw operationError(
      `Reassign or cancel ${scheduledAssignments} scheduled assignment${scheduledAssignments === 1 ? "" : "s"} before archiving this resource.`,
      409,
      "SCHEDULED_ASSIGNMENTS",
      { scheduledAssignments }
    );
  }

  const previousStatus = profile.status;
  const previousAvailability = profile.availabilityStatus;
  profile.status = "suspended";
  profile.availabilityStatus = "unavailable";
  profile.archivedAt = now;
  profile.archivedBy = actorUserId;
  profile.archiveReason = reason;
  profile.updatedBy = actorUserId;
  const deploymentUpdate = await ResourceDeploymentModel.updateMany(
    { resourceProfileId: profile._id, status: "active" },
    { $set: { status: "paused", updatedBy: actorUserId } }
  );
  await profile.save();
  if (profile.userId) {
    await UserModel.updateOne({ _id: profile.userId }, { $inc: { tokenVersion: 1 } });
    await revokeSessions(profile.userId);
  }
  await PlatformAuditModel.create({
    actorUserId,
    action: "afterlight_resource_archived",
    metadata: {
      resourceProfileId: profile._id,
      reason,
      previousStatus,
      previousAvailability,
      pausedDeployments: deploymentUpdate.modifiedCount || 0,
      archivedAt: now,
    },
  });
  return { profile, pausedDeployments: deploymentUpdate.modifiedCount || 0 };
}

async function restoreResourceProfile({
  resourceId,
  actorUserId,
  now = new Date(),
  ResourceProfileModel = ResourceProfile,
  PlatformAuditModel = PlatformAudit,
}) {
  const profile = await ResourceProfileModel.findOne({
    _id: resourceId,
    archivedAt: { $ne: null },
  });
  if (!profile) throw operationError("Archived resource profile not found.", 404, "RESOURCE_NOT_FOUND");
  const previousArchivedAt = profile.archivedAt;
  const previousArchiveReason = profile.archiveReason;
  profile.archivedAt = null;
  profile.archivedBy = null;
  profile.archiveReason = "";
  profile.status = profile.userId ? "suspended" : "invited";
  profile.availabilityStatus = profile.userId ? "unavailable" : "available";
  profile.updatedBy = actorUserId;
  await profile.save();
  await PlatformAuditModel.create({
    actorUserId,
    action: "afterlight_resource_restored",
    metadata: {
      resourceProfileId: profile._id,
      previousArchivedAt,
      previousArchiveReason,
      restoredAt: now,
      status: profile.status,
    },
  });
  return { profile };
}

module.exports = {
  archiveOrganizationUser,
  archiveReason,
  archiveResourceProfile,
  restoreOrganizationUser,
  restoreResourceProfile,
};
