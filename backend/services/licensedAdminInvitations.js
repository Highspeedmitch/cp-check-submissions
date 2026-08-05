const mongoose = require("mongoose");
const Organization = require("../models/organization");
const OrganizationInvitation = require("../models/organizationInvitation");
const User = require("../models/user");
const PlatformAudit = require("../models/platformAudit");
const { consumeGrant } = require("./organizationPasskeys");
const {
  createInvitation,
  deliverInvitation,
  normalizeInvitationEmail,
} = require("./organizationInvitations");
const {
  adminLimitError,
  summarizeAdminSeatCounts,
} = require("./licenseEntitlements");
const { sendSystemEmail } = require("./systemEmail");

const MAX_ADMIN_INVITATIONS_PER_REQUEST = 10;

function operationError(message, status = 400, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function normalizeAdminInvitationEmails(value) {
  const supplied = Array.isArray(value) ? value : [value];
  const emails = [...new Set(supplied
    .flatMap((entry) => String(entry || "").split(/[\n,;]/))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizeInvitationEmail))];
  if (!emails.length) throw operationError("Enter at least one administrator email address.");
  if (emails.length > MAX_ADMIN_INVITATIONS_PER_REQUEST) {
    throw operationError(`Invite no more than ${MAX_ADMIN_INVITATIONS_PER_REQUEST} administrators at a time.`);
  }
  return emails;
}

function withSession(query, session) {
  return session && query && typeof query.session === "function" ? query.session(session) : query;
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

async function queryCount(Model, filter, session) {
  return withSession(Model.countDocuments(filter), session);
}

async function queryLean(Model, filter, fields, session) {
  let query = Model.find(filter);
  if (fields && typeof query.select === "function") query = query.select(fields);
  query = withSession(query, session);
  return typeof query.lean === "function" ? query.lean() : query;
}

async function createLicensedAdminInvitations({
  organizationId,
  invitedBy,
  emails: suppliedEmails,
  adminActionGrant,
  ipAddress = "",
  userAgent = "",
  now = new Date(),
  OrganizationModel = Organization,
  InvitationModel = OrganizationInvitation,
  UserModel = User,
  PlatformAuditModel = PlatformAudit,
  consumeAdminGrant = consumeGrant,
  createInvitationRecord = createInvitation,
  deliverInvitationEmail = deliverInvitation,
  sendEmail = sendSystemEmail,
  transactionRunner = defaultTransactionRunner,
}) {
  const emails = normalizeAdminInvitationEmails(suppliedEmails);
  const transactionResult = await transactionRunner(async (session) => {
    const organization = await withSession(OrganizationModel.findById(organizationId), session);
    if (!organization) throw operationError("Organization not found.", 404);

    const [active, pending, existingPending] = await Promise.all([
      queryCount(UserModel, {
        organizationId,
        role: "admin",
        accountStatus: "active",
        organizationArchivedAt: null,
      }, session),
      queryCount(InvitationModel, {
        organizationId,
        role: "admin",
        status: "pending",
        expiresAt: { $gt: now },
      }, session),
      queryLean(InvitationModel, {
        organizationId,
        role: "admin",
        email: { $in: emails },
        status: "pending",
        expiresAt: { $gt: now },
      }, "email", session),
    ]);

    if (existingPending.length) {
      throw operationError(
        `An active administrator invitation already exists for ${existingPending[0].email}.`,
        409,
        "ADMIN_INVITATION_EXISTS"
      );
    }

    const before = summarizeAdminSeatCounts({ organization, active, pending });
    if (!before.unmetered && emails.length > before.remaining) throw adminLimitError(before);

    const grantAccepted = await consumeAdminGrant({
      organization,
      userId: invitedBy,
      purpose: "invite_admin",
      token: adminActionGrant,
      session,
    });
    if (!grantAccepted) {
      throw operationError("Administrative verification expired or was already used.", 403, "ADMIN_GRANT_INVALID");
    }

    const prepared = [];
    for (const email of emails) {
      const created = await createInvitationRecord({
        organization,
        email,
        role: "admin",
        invitedBy,
        inviterScope: "organization",
        allowOrganizationAdmin: true,
        deliver: false,
        session,
        InvitationModel,
        UserModel,
        now,
      });
      prepared.push(created);
    }

    if (!organization.license) organization.license = {};
    organization.license.adminSeatVersion = Number(organization.license.adminSeatVersion || 0) + 1;
    organization.license.updatedAt = now;
    organization.license.updatedBy = invitedBy;
    await organization.save({ session });

    const after = summarizeAdminSeatCounts({
      organization,
      active,
      pending: pending + prepared.length,
    });
    const auditRecords = prepared.map(({ invitation }) => ({
      actorUserId: invitedBy,
      action: "organization_admin_invitation_created",
      targetOrganizationId: organization._id,
      metadata: {
        invitationId: invitation._id,
        email: invitation.email,
        adminSeatLimit: after.limit,
        adminSeatsAllocated: after.allocated,
        licenseTier: after.tier,
      },
      ipAddress,
      userAgent,
    }));
    if (auditRecords.length) await PlatformAuditModel.create(auditRecords, { session });
    return { organization, prepared, adminSeats: after };
  });

  const invitations = [];
  for (const { invitation, token } of transactionResult.prepared) {
    let delivered = true;
    try {
      await deliverInvitationEmail({
        invitation,
        organization: transactionResult.organization,
        token,
        sendEmail,
      });
    } catch (error) {
      delivered = false;
      console.error("Administrator invitation email delivery error:", error.message);
    }
    invitations.push({
      _id: invitation._id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      lastSentAt: invitation.lastSentAt,
      delivered,
    });
  }

  return {
    invitations,
    adminSeats: transactionResult.adminSeats,
    delivered: invitations.every((invitation) => invitation.delivered),
  };
}

module.exports = {
  MAX_ADMIN_INVITATIONS_PER_REQUEST,
  normalizeAdminInvitationEmails,
  createLicensedAdminInvitations,
  defaultTransactionRunner,
};
