const Organization = require("../models/organization");
const OrganizationInvitation = require("../models/organizationInvitation");
const PlatformAudit = require("../models/platformAudit");
const User = require("../models/user");
const {
  ORGANIZATION_INVITE_ROLES,
  createInvitation,
  deliverInvitation,
} = require("./organizationInvitations");
const { currentLicenseCapacity } = require("./licenseCapacity");
const { reserveLicensedCapacity } = require("./licensedCapacityOperations");
const { sendSystemEmail } = require("./systemEmail");

function invitationError(message, status = 400, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

async function createLicensedOrganizationInvitation({
  organizationId,
  email,
  role,
  propertyIds = [],
  invitedBy,
  ipAddress = "",
  userAgent = "",
  now = new Date(),
  OrganizationModel = Organization,
  InvitationModel = OrganizationInvitation,
  UserModel = User,
  PlatformAuditModel = PlatformAudit,
  createInvitationRecord = createInvitation,
  deliverInvitationEmail = deliverInvitation,
  sendEmail = sendSystemEmail,
  reserveCapacity = reserveLicensedCapacity,
  transactionRunner,
}) {
  if (!ORGANIZATION_INVITE_ROLES.has(role)) {
    throw invitationError("Select a valid invitation role.");
  }

  const result = await reserveCapacity({
    organizationId,
    dimension: "users",
    additional: 1,
    actorUserId: invitedBy,
    now,
    OrganizationModel,
    ...(transactionRunner ? { transactionRunner } : {}),
    capacityOptions: { UserModel, InvitationModel },
    work: async ({ organization, session }) => {
      const validPropertyIds = new Set((organization.properties || []).map((property) => String(property._id)));
      const normalizedPropertyIds = ["property_manager", "client"].includes(role)
        ? [...new Set((propertyIds || []).map(String))]
        : [];
      if (normalizedPropertyIds.some((id) => !validPropertyIds.has(id))) {
        throw invitationError("One or more selected properties are outside this organization.");
      }

      const created = await createInvitationRecord({
        organization,
        email,
        role,
        propertyIds: normalizedPropertyIds,
        invitedBy,
        inviterScope: "organization",
        deliver: false,
        session,
        InvitationModel,
        UserModel,
        now,
      });
      await PlatformAuditModel.create([{
        actorUserId: invitedBy,
        action: "organization_invitation_created",
        targetOrganizationId: organization._id,
        metadata: {
          invitationId: created.invitation._id,
          email: created.invitation.email,
          role,
        },
        ipAddress,
        userAgent,
      }], { session });
      return created;
    },
  });

  let delivered = true;
  try {
    await deliverInvitationEmail({
      invitation: result.value.invitation,
      organization: result.organization,
      token: result.value.token,
      sendEmail,
    });
  } catch (error) {
    delivered = false;
    console.error("Invitation email delivery error:", error.message);
  }
  const capacity = await currentLicenseCapacity({
    organization: result.organization,
    UserModel,
    InvitationModel,
    now,
  });
  return { invitation: result.value.invitation, delivered, capacity };
}

module.exports = {
  createLicensedOrganizationInvitation,
  invitationError,
};
