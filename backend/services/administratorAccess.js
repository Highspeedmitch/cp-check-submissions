const mongoose = require("mongoose");
const Organization = require("../models/organization");
const OrganizationInvitation = require("../models/organizationInvitation");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const PlatformAudit = require("../models/platformAudit");
const { consumeGrant } = require("./organizationPasskeys");
const { revokeUserSessions } = require("./authSessions");
const {
  assertLicenseCapacity,
  currentLicenseCapacity,
  ORGANIZATION_ACCOUNT_SCOPE,
  touchCapacityVersion,
  withSession,
} = require("./licenseCapacity");
const { normalizeOrganizationUserClassification } = require("./organizationUserClassification");
const { withoutAutomaticPropertyEmails } = require("./propertyEmails");
const { sendUserNotification } = require("./notifications");
const { sendSystemEmail } = require("./systemEmail");

const ADMIN_ACCESS_DISPOSITIONS = new Set(["archive", "demote"]);

function operationError(message, status = 400, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function removalReason(value) {
  const reason = String(value || "").trim().replace(/\s+/g, " ");
  if (reason.length < 3 || reason.length > 500) {
    throw operationError(
      "Enter a reason between 3 and 500 characters.",
      400,
      "INVALID_ADMIN_ACCESS_REASON"
    );
  }
  return reason;
}

async function defaultTransactionRunner(work) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function findDocument(Model, filter, fields, session) {
  let query = Model.findOne(filter);
  if (fields && typeof query.select === "function") query = query.select(fields);
  return withSession(query, session);
}

async function countDocuments(Model, filter, session) {
  return withSession(Model.countDocuments(filter), session);
}

function updatePropertyAssignments(organization, target, classification, assignedIds) {
  const selected = new Set(assignedIds.map(String));
  const assignedPropertyIds = [];
  for (const property of organization.properties || []) {
    property.propertyManagers = (property.propertyManagers || [])
      .filter((id) => String(id) !== String(target._id));
    property.clientOwners = (property.clientOwners || [])
      .filter((id) => String(id) !== String(target._id));
    if (!selected.has(String(property._id))) continue;

    if (classification?.role === "property_manager") {
      property.propertyManagers.push(target._id);
      property.emails = withoutAutomaticPropertyEmails(property.emails, [target.email]);
      assignedPropertyIds.push(String(property._id));
    } else if (classification?.role === "client") {
      property.clientOwners.push(target._id);
      assignedPropertyIds.push(String(property._id));
    }
  }
  return assignedPropertyIds;
}

async function changeOrganizationAdministratorAccess({
  organizationId,
  actorUserId,
  targetUserId,
  disposition,
  targetRole,
  engagementType,
  propertyIds = [],
  reason: suppliedReason,
  adminActionGrant,
  ipAddress = "",
  userAgent = "",
  now = new Date(),
  OrganizationModel = Organization,
  InvitationModel = OrganizationInvitation,
  UserModel = User,
  UserAuditModel = UserAudit,
  PlatformAuditModel = PlatformAudit,
  consumeAdminGrant = consumeGrant,
  revokeSessions = revokeUserSessions,
  notifyUser = sendUserNotification,
  sendEmail = sendSystemEmail,
  capacityResolver = currentLicenseCapacity,
  transactionRunner = defaultTransactionRunner,
}) {
  const normalizedDisposition = String(disposition || "").trim().toLowerCase();
  if (!ADMIN_ACCESS_DISPOSITIONS.has(normalizedDisposition)) {
    throw operationError("Select how the administrator's access should change.", 400, "INVALID_DISPOSITION");
  }
  if (String(actorUserId) === String(targetUserId)) {
    throw operationError(
      "You cannot remove your own administrator access from this workflow.",
      409,
      "ADMIN_SELF_REMOVAL"
    );
  }
  const reason = removalReason(suppliedReason);
  const classification = normalizedDisposition === "demote"
    ? normalizeOrganizationUserClassification({ role: targetRole, engagementType })
    : { role: "user", engagementType: "customer_employee" };

  const result = await transactionRunner(async (session) => {
    const organization = await withSession(OrganizationModel.findById(organizationId), session);
    if (!organization) throw operationError("Organization not found.", 404, "ORGANIZATION_NOT_FOUND");

    const [actor, target, activeAdministratorCount] = await Promise.all([
      findDocument(UserModel, {
        _id: actorUserId,
        organizationId,
        ...ORGANIZATION_ACCOUNT_SCOPE,
        role: "admin",
        accountStatus: { $ne: "inactive" },
        organizationArchivedAt: null,
      }, "username email role accountStatus platformRole", session),
      findDocument(UserModel, {
        _id: targetUserId,
        organizationId,
        ...ORGANIZATION_ACCOUNT_SCOPE,
        role: "admin",
        organizationArchivedAt: null,
      }, "username email role engagementType accountStatus platformRole tokenVersion", session),
      countDocuments(UserModel, {
        organizationId,
        ...ORGANIZATION_ACCOUNT_SCOPE,
        role: "admin",
        accountStatus: { $ne: "inactive" },
        organizationArchivedAt: null,
      }, session),
    ]);
    if (!actor) throw operationError("Active administrator access is required.", 403, "ADMIN_ACCESS_REQUIRED");
    if (!target) throw operationError("Administrator not found.", 404, "ADMIN_NOT_FOUND");
    if (target.platformRole === "platform_admin") {
      throw operationError(
        "Platform administrator access must be managed through platform recovery controls.",
        409,
        "PLATFORM_ADMIN_PROTECTED"
      );
    }
    const targetIsActive = target.accountStatus !== "inactive";
    if (targetIsActive && activeAdministratorCount <= 1) {
      throw operationError(
        "Invite and verify another administrator before removing the last active administrator.",
        409,
        "LAST_ACTIVE_ADMIN"
      );
    }

    const validPropertyIds = new Set(
      (organization.properties || []).map((property) => String(property._id))
    );
    const requestedPropertyIds = ["property_manager", "client"].includes(classification.role)
      ? [...new Set((propertyIds || []).map(String))]
      : [];
    if (requestedPropertyIds.some((id) => !validPropertyIds.has(id))) {
      throw operationError(
        "One or more properties are outside this organization.",
        400,
        "INVALID_PROPERTY_SCOPE"
      );
    }

    const beforeCapacity = await capacityResolver({
      organization,
      session,
      now,
      UserModel,
      InvitationModel,
    });
    if (normalizedDisposition === "demote" && targetIsActive) {
      assertLicenseCapacity({ summary: beforeCapacity, dimension: "users", additional: 1 });
    }

    const grantAccepted = await consumeAdminGrant({
      organization,
      userId: actorUserId,
      purpose: "remove_admin",
      token: adminActionGrant,
      session,
    });
    if (!grantAccepted) {
      throw operationError(
        "Administrative verification expired or was already used.",
        403,
        "ADMIN_GRANT_INVALID"
      );
    }

    const before = {
      role: target.role,
      engagementType: target.engagementType || null,
      accountStatus: target.accountStatus,
      organizationArchivedAt: target.organizationArchivedAt || null,
    };
    const assignedPropertyIds = updatePropertyAssignments(
      organization,
      target,
      normalizedDisposition === "demote" ? classification : null,
      requestedPropertyIds
    );

    target.role = classification.role;
    target.engagementType = classification.engagementType;
    if (normalizedDisposition === "archive") {
      target.organizationArchivedAt = now;
      target.organizationArchivedBy = actorUserId;
      target.organizationArchiveReason = reason;
    } else {
      target.organizationArchivedAt = null;
      target.organizationArchivedBy = null;
      target.organizationArchiveReason = "";
    }
    target.tokenVersion = Number(target.tokenVersion || 0) + 1;

    if (!organization.license) organization.license = {};
    organization.license.adminSeatVersion = Number(organization.license.adminSeatVersion || 0) + 1;
    touchCapacityVersion(organization, { actorUserId, now });

    const after = {
      disposition: normalizedDisposition,
      role: target.role,
      engagementType: target.engagementType || null,
      accountStatus: target.accountStatus,
      organizationArchivedAt: target.organizationArchivedAt || null,
      propertyIds: assignedPropertyIds,
    };
    await Promise.all([
      organization.save({ session }),
      target.save({ session }),
      UserAuditModel.create([{
        organizationId,
        targetUserId: target._id,
        changedBy: actorUserId,
        action: "organization_administrator_access_changed",
        changes: { reason, before, after },
      }], { session }),
      PlatformAuditModel.create([{
        actorUserId,
        action: "organization_administrator_access_changed",
        targetOrganizationId: organization._id,
        metadata: {
          targetUserId: target._id,
          targetEmail: target.email,
          reason,
          before,
          after,
        },
        ipAddress,
        userAgent,
      }], { session }),
    ]);

    return {
      organization,
      actor: { _id: actor._id, username: actor.username, email: actor.email },
      target: { _id: target._id, username: target.username, email: target.email },
      disposition: normalizedDisposition,
      classification,
      reason,
    };
  });

  let sessionRevocationFailed = false;
  try {
    await revokeSessions(result.target._id);
  } catch (error) {
    sessionRevocationFailed = true;
    console.error("Administrator session revocation error:", error);
  }

  let remainingAdministrators = [];
  let administratorLookupFailed = false;
  try {
    let remainingQuery = UserModel.find({
      organizationId,
      ...ORGANIZATION_ACCOUNT_SCOPE,
      role: "admin",
      accountStatus: { $ne: "inactive" },
      organizationArchivedAt: null,
      _id: { $ne: actorUserId },
    });
    if (typeof remainingQuery.select === "function") remainingQuery = remainingQuery.select("_id");
    if (typeof remainingQuery.lean === "function") remainingQuery = remainingQuery.lean();
    remainingAdministrators = await remainingQuery;
  } catch (error) {
    administratorLookupFailed = true;
    console.error("Remaining administrator notification lookup error:", error);
  }
  const targetLabel = result.target.username || result.target.email;
  const targetBody = result.disposition === "archive"
    ? `Your access to ${result.organization.name} was removed.`
    : `Your administrator access to ${result.organization.name} was changed to ${result.classification.role.replaceAll("_", " ")}.`;
  const notificationDeliveries = await Promise.allSettled([
    notifyUser({
      organizationId,
      userId: result.target._id,
      type: "organization_administrator_access_changed",
      title: "Administrator access changed",
      body: targetBody,
      route: result.disposition === "archive" ? "/" : "/dashboard",
      entityId: result.target._id,
    }),
    ...remainingAdministrators.map((administrator) => notifyUser({
      organizationId,
      userId: administrator._id,
      type: "organization_administrator_access_changed",
      title: "Administrator access changed",
      body: `${targetLabel}'s administrator access was changed by ${result.actor.username || result.actor.email}.`,
      route: "/admin/users",
      entityId: result.target._id,
    })),
    sendEmail({
      to: result.target.email,
      subject: `Your ${result.organization.name} administrator access changed`,
      text: [
        targetBody,
        `Reason: ${result.reason}`,
        "If you believe this was unexpected, contact another organization administrator or Afterlight support.",
      ].join("\n\n"),
    }),
  ]);

  let capacity = null;
  try {
    capacity = await capacityResolver({
      organization: result.organization,
      now,
      UserModel,
      InvitationModel,
    });
  } catch (error) {
    console.error("Administrator access capacity refresh error:", error);
  }
  return {
    disposition: result.disposition,
    target: result.target,
    role: result.classification.role,
    engagementType: result.classification.engagementType,
    adminSeats: capacity?.administrators || null,
    userSeats: capacity?.users || null,
    sessionRevocationFailed,
    notificationFailures: notificationDeliveries
      .filter((delivery) => delivery.status === "rejected").length
      + (administratorLookupFailed ? 1 : 0),
  };
}

module.exports = {
  ADMIN_ACCESS_DISPOSITIONS,
  changeOrganizationAdministratorAccess,
  defaultTransactionRunner,
  operationError,
  removalReason,
  updatePropertyAssignments,
};
