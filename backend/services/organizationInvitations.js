const crypto = require("crypto");
const OrganizationInvitation = require("../models/organizationInvitation");
const User = require("../models/user");
const { buildFrontendUrl } = require("../utils/frontendUrls");
const { sendSystemEmail } = require("./systemEmail");

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ORGANIZATION_INVITE_ROLES = new Set(["property_manager", "user", "client", "contractor", "cleaner"]);

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

function invitationRoleLabel(role) {
  return ({
    admin: "Organization Administrator",
    property_manager: "Property Manager",
    user: "Submitter",
    client: "Property Owner",
    contractor: "Contractor",
    cleaner: "Cleaner",
  })[role] || role;
}

async function deliverInvitation({ invitation, organization, token, sendEmail = sendSystemEmail }) {
  const link = invitationUrl(token);
  await sendEmail({
    to: invitation.email,
    subject: `You're invited to join ${organization.name} in Afterlight`,
    text: [
      `You have been invited to join ${organization.name} in Afterlight as ${invitationRoleLabel(invitation.role)}.`,
      "",
      `Create your account: ${link}`,
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
  propertyIds = [],
  invitedBy,
  inviterScope,
  InvitationModel = OrganizationInvitation,
  UserModel = User,
  sendEmail = sendSystemEmail,
  now = new Date(),
}) {
  const normalizedEmail = normalizeInvitationEmail(email);
  const existingUser = await UserModel.findOne({ email: normalizedEmail }).select("_id").lean();
  if (existingUser) throw new Error("That email address already belongs to an Afterlight account.");
  if (role === "admin" && inviterScope !== "platform") {
    throw new Error("Administrator invitations must be issued by a platform administrator.");
  }
  if (role !== "admin" && !ORGANIZATION_INVITE_ROLES.has(role)) {
    throw new Error("Select a valid invitation role.");
  }

  await InvitationModel.updateMany({
    organizationId: organization._id,
    email: normalizedEmail,
    status: { $in: ["pending", "expired"] },
  }, { $set: { status: "revoked", revokedAt: now } });

  const token = invitationToken();
  const invitation = await InvitationModel.create({
    organizationId: organization._id,
    email: normalizedEmail,
    role,
    propertyIds,
    tokenHash: hashInvitationToken(token),
    invitedBy,
    inviterScope,
    expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
    lastSentAt: now,
  });
  let delivered = true;
  try {
    await deliverInvitation({ invitation, organization, token, sendEmail });
  } catch (error) {
    delivered = false;
    console.error("Invitation email delivery error:", error.message);
  }
  return { invitation, delivered };
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
