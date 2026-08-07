const crypto = require("crypto");
const OrganizationInvitation = require("../models/organizationInvitation");
const User = require("../models/user");
const { buildFrontendUrl } = require("../utils/frontendUrls");
const { sendSystemEmail } = require("./systemEmail");
const {
  customerEngagementLabel,
  normalizeOrganizationUserClassification,
} = require("./organizationUserClassification");

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ORGANIZATION_INVITE_ROLES = new Set([
  "field_operator", "property_manager", "user", "client", "contractor", "cleaner",
]);

function normalizeInvitationEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Enter a valid invitation email address.");
  }
  return email;
}

function invitationToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function invitationUrl(token) {
  return `${buildFrontendUrl("/join")}#${encodeURIComponent(token)}`;
}

function invitationRoleLabel(role, engagementType = null, accountScope = "organization") {
  if (accountScope === "afterlight_resource") {
    return role === "contractor" ? "Afterlight Contractor" : "Afterlight Resource";
  }
  const accessRole = ({
    admin: "Organization Administrator",
    property_manager: "Property Manager",
    user: "Field Operator",
    client: "Property Owner",
    contractor: "Contractor",
    cleaner: "Cleaner",
  })[role] || role;
  return engagementType ? `${accessRole} - ${customerEngagementLabel(engagementType)}` : accessRole;
}

async function deliverInvitation({ invitation, organization, token, sendEmail = sendSystemEmail }) {
  const link = invitationUrl(token);
  const resourceHelp = invitation.accountScope === "afterlight_resource"
    ? ["", `Resource account setup guide: ${buildFrontendUrl("/help/resource-account-setup")}`]
    : [];
  await sendEmail({
    to: invitation.email,
    subject: `You're invited to join ${organization.name} in Afterlight`,
    text: [
      `You have been invited to join ${organization.name} in Afterlight as ${invitationRoleLabel(invitation.role, invitation.engagementType, invitation.accountScope)}.`,
      "",
      `Create your account: ${link}`,
      ...resourceHelp,
      "",
      "This secure invitation expires in 7 days and can only be used once.",
      "If you were not expecting this invitation, you can ignore this email.",
    ].join("\n"),
  });
}

async function createInvitation({
  organization,
  email,
  role,
  engagementType = null,
  propertyIds = [],
  invitedBy,
  inviterScope,
  accountScope = "organization",
  InvitationModel = OrganizationInvitation,
  UserModel = User,
  sendEmail = sendSystemEmail,
  now = new Date(),
  allowOrganizationAdmin = false,
  deliver = true,
  session,
}) {
  const normalizedEmail = normalizeInvitationEmail(email);
  const organizationClassification = accountScope === "organization" && role !== "admin"
    ? normalizeOrganizationUserClassification({ role, engagementType })
    : { role, engagementType: null };
  let existingUserQuery = UserModel.findOne({ email: normalizedEmail })
    .select("_id organizationId organizationArchivedAt");
  if (session && typeof existingUserQuery.session === "function") {
    existingUserQuery = existingUserQuery.session(session);
  }
  const existingUser = await existingUserQuery.lean();
  if (existingUser?.organizationArchivedAt
    && String(existingUser.organizationId) === String(organization._id)) {
    throw new Error("An archived user already exists for that email address. Restore the archived user instead.");
  }
  if (existingUser) throw new Error("That email address already belongs to an Afterlight account.");
  if (role === "admin" && inviterScope !== "platform" && !allowOrganizationAdmin) {
    throw new Error("Administrator invitations must be issued by a platform administrator.");
  }
  if (accountScope === "organization" && role !== "admin" && !ORGANIZATION_INVITE_ROLES.has(role)) {
    throw new Error("Select a valid invitation role.");
  }

  let revokeQuery = InvitationModel.updateMany({
    organizationId: organization._id,
    email: normalizedEmail,
    status: { $in: ["pending", "expired"] },
  }, { $set: { status: "revoked", revokedAt: now } });
  if (session && typeof revokeQuery.session === "function") revokeQuery = revokeQuery.session(session);
  await revokeQuery;

  const token = invitationToken();
  const record = {
    organizationId: organization._id,
    email: normalizedEmail,
    role: role === "admin" ? role : organizationClassification.role,
    engagementType: role === "admin" ? null : organizationClassification.engagementType,
    propertyIds,
    tokenHash: hashInvitationToken(token),
    invitedBy,
    inviterScope,
    accountScope,
    expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
    lastSentAt: now,
  };
  const invitation = session
    ? (await InvitationModel.create([record], { session }))[0]
    : await InvitationModel.create(record);
  let deliveredStatus = null;
  if (deliver) {
    deliveredStatus = true;
    try {
      await deliverInvitation({ invitation, organization, token, sendEmail });
    } catch (error) {
      deliveredStatus = false;
      console.error("Invitation email delivery error:", error.message);
    }
  }
  return { invitation, delivered: deliveredStatus, token };
}

async function resendInvitation({ invitation, organization, sendEmail = sendSystemEmail, now = new Date() }) {
  if (!["pending", "expired"].includes(invitation.status)) {
    throw new Error("Only pending or expired invitations can be resent.");
  }
  const token = invitationToken();
  invitation.tokenHash = hashInvitationToken(token);
  invitation.status = "pending";
  invitation.expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
  invitation.lastSentAt = now;
  await invitation.save();
  await deliverInvitation({ invitation, organization, token, sendEmail });
  return invitation;
}

async function expireInvitations(scope = {}, InvitationModel = OrganizationInvitation, now = new Date()) {
  await InvitationModel.updateMany({ ...scope, status: "pending", expiresAt: { $lte: now } }, {
    $set: { status: "expired" },
  });
}

module.exports = {
  INVITATION_LIFETIME_MS,
  ORGANIZATION_INVITE_ROLES,
  normalizeInvitationEmail,
  invitationToken,
  hashInvitationToken,
  invitationUrl,
  invitationRoleLabel,
  deliverInvitation,
  createInvitation,
  resendInvitation,
  expireInvitations,
};
