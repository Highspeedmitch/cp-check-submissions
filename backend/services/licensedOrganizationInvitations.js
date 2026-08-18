const Organization = require("../models/organization");
const OrganizationInvitation = require("../models/organizationInvitation");
const PlatformAudit = require("../models/platformAudit");
const User = require("../models/user");
const {
  ORGANIZATION_INVITE_ROLES,
  createInvitation,
  deliverInvitation,
  invitationUrl,
  normalizeInvitationDeliveryMethod,
} = require("./organizationInvitations");
const { currentLicenseCapacity } = require("./licenseCapacity");
const { reserveLicensedCapacity } = require("./licensedCapacityOperations");
const { sendSystemEmail } = require("./systemEmail");
const { normalizeOrganizationUserClassification } = require("./organizationUserClassification");
const { validateScopeSelection } = require("./routeScopes");

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
  engagementType = null,
  propertyIds = [],
  routeIds = [],
  invitedBy,
  ipAddress = "",
  userAgent = "",
  deliveryMethod = "email",
  now = new Date(),
  OrganizationModel = Organization,
  InvitationModel = OrganizationInvitation,
  UserModel = User,
  PlatformAuditModel = PlatformAudit,
  createInvitationRecord = createInvitation,
  deliverInvitationEmail = deliverInvitation,
  sendEmail = sendSystemEmail,
  reserveCapacity = reserveLicensedCapacity,
  capacityReader = currentLicenseCapacity,
  transactionRunner,
}) {
  if (!ORGANIZATION_INVITE_ROLES.has(role)) throw invitationError("Select a valid invitation role.");
  const normalizedDeliveryMethod = normalizeInvitationDeliveryMethod(deliveryMethod);
  const classification = normalizeOrganizationUserClassification({ role, engagementType });

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
      let scope;
      try {
        scope = validateScopeSelection(organization, {
          role: classification.role,
          propertyIds,
          routeIds,
        });
      } catch (scopeError) {
        throw invitationError(scopeError.message);
      }

      const created = await createInvitationRecord({
        organization,
        email,
        role: classification.role,
        engagementType: classification.engagementType,
        propertyIds: scope.propertyIds,
        routeIds: scope.routeIds,
        invitedBy,
        inviterScope: "organization",
        deliveryMethod: normalizedDeliveryMethod,
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
          role: classification.role,
          engagementType: classification.engagementType,
          propertyIds: scope.propertyIds,
          routeIds: scope.routeIds,
          deliveryMethod: normalizedDeliveryMethod,
        },
        ipAddress,
        userAgent,
      }], { session });
      return created;
    },
  });

  let delivered = null;
  let manualActivation = null;
  if (normalizedDeliveryMethod === "email") {
    delivered = true;
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
  } else {
    manualActivation = {
      setupUrl: invitationUrl(result.value.token),
      expiresAt: result.value.invitation.expiresAt,
    };
  }
  const capacity = await capacityReader({
    organization: result.organization,
    UserModel,
    InvitationModel,
    now,
  });
  return {
    invitation: result.value.invitation,
    delivered,
    manualActivation,
    capacity,
  };
}

module.exports = {
  createLicensedOrganizationInvitation,
  invitationError,
};
