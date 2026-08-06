const User = require("../models/user");
const { sendSystemEmail } = require("./systemEmail");
const { buildFrontendUrl } = require("../utils/frontendUrls");

const MODEL_LABELS = {
  platform: "Full-stack SaaS",
  managed: "Managed service",
  hybrid: "Hybrid",
};

const TIER_LABELS = {
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3",
};

function requestLabel(request) {
  if (request.changeType === "license_tier") return "license tier increase";
  if (request.changeType === "custom_capacity") return "custom administrator capacity increase";
  return "service model change";
}

function requestTitle(request) {
  if (request.changeType === "license_tier") return "License tier increase";
  if (request.changeType === "custom_capacity") return "Administrator capacity increase";
  return "Service model change";
}

function currentPlanLabel(request) {
  const model = MODEL_LABELS[request.currentServiceModel] || request.currentServiceModel;
  const plan = request.currentLicenseTier ? `${model} ${TIER_LABELS[request.currentLicenseTier]}` : model;
  return request.changeType === "custom_capacity"
    ? `${plan} (${request.organizationSnapshot?.currentAdminLimit} administrator seats)`
    : plan;
}

function requestedPlanLabel(request) {
  const model = MODEL_LABELS[request.requestedServiceModel] || request.requestedServiceModel;
  const plan = request.requestedLicenseTier ? `${model} ${TIER_LABELS[request.requestedLicenseTier]}` : model;
  return request.changeType === "custom_capacity"
    ? `${plan} (${request.organizationSnapshot?.requestedAdminLimit} administrator seats)`
    : plan;
}

function percentageLabel(value) {
  return value == null ? "None" : `${value}%`;
}

function dateLabel(value) {
  return value ? new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" }) : "Not specified";
}

async function platformAdminEmails(UserModel = User) {
  const users = await UserModel.find({
    platformRole: "platform_admin",
    accountStatus: { $ne: "inactive" },
  }).select("email").lean();
  return [...new Set(users.map((user) => String(user.email || "").trim().toLowerCase()).filter(Boolean))];
}

async function deliverPlatformRequestEmail({
  request,
  organization,
  requester,
  sendEmail = sendSystemEmail,
  UserModel = User,
}) {
  const recipients = await platformAdminEmails(UserModel);
  if (!recipients.length) throw new Error("No active platform administrator email is available.");
  const latestOrganizationMessage = [...(request.messages || [])]
    .reverse()
    .find((message) => message.actorScope === "organization_admin");
  const latestUpdate = latestOrganizationMessage
    && String(latestOrganizationMessage.message || "").trim() !== String(request.reason || "").trim()
    ? latestOrganizationMessage.message
    : "";
  await sendEmail({
    to: recipients,
    subject: `${requestTitle(request)} requested: ${organization.name}`,
    text: [
      `${requester.email} requested a ${requestLabel(request)} for ${organization.name}.`,
      "",
      `Current plan: ${currentPlanLabel(request)}`,
      `Requested plan: ${requestedPlanLabel(request)}`,
      `Proposed effective date: ${dateLabel(request.proposedEffectiveDate)}`,
      `Properties: ${request.organizationSnapshot.propertyCount}`,
      `Customer users: ${(request.organizationSnapshot.activeUserCount || 0) + (request.organizationSnapshot.pendingUserCount || 0)}`,
      `Organization administrators: ${(request.organizationSnapshot.activeAdministratorCount || 0) + (request.organizationSnapshot.pendingAdministratorCount || 0)}`,
      request.organizationSnapshot.currentAfterlightPortfolioMinimumPercent != null
        || request.organizationSnapshot.requestedAfterlightPortfolioMinimumPercent != null
        ? `Afterlight portfolio minimum: ${percentageLabel(request.organizationSnapshot.currentAfterlightPortfolioMinimumPercent)} -> ${percentageLabel(request.organizationSnapshot.requestedAfterlightPortfolioMinimumPercent)}`
        : null,
      `Property fulfillment overrides: ${request.organizationSnapshot.propertyOverrideCount}`,
      `Current default fulfillment: ${request.organizationSnapshot.defaultFulfillmentSource}`,
      `Policy version: ${request.organizationSnapshot.policyVersion}`,
      "",
      `Reason: ${request.reason}`,
      latestUpdate ? "" : null,
      latestUpdate ? `Latest organization update: ${latestUpdate}` : null,
      "",
      `Review this request in Platform Administration: ${buildFrontendUrl("/platform")}`,
      `Request ID: ${request._id}`,
    ].filter((line) => line !== null).join("\n"),
  });
  return recipients;
}

async function deliverRequesterDecisionEmail({ request, organization, requester, sendEmail = sendSystemEmail }) {
  const statusCopy = {
    approved: "approved and applied",
    denied: "denied",
    information_requested: "returned for more information",
  }[request.status] || request.status;
  await sendEmail({
    to: requester.email,
    subject: `${requestTitle(request)} request ${statusCopy}: ${organization.name}`,
    text: [
      `Your request to change ${organization.name} from ${currentPlanLabel(request)} to ${requestedPlanLabel(request)} was ${statusCopy}.`,
      request.platformResponse ? "" : null,
      request.platformResponse ? `Platform response: ${request.platformResponse}` : null,
      "",
      request.status === "information_requested"
        ? `Respond from Service Delivery in Afterlight: ${buildFrontendUrl("/service-delivery")}`
        : `View Service Delivery in Afterlight: ${buildFrontendUrl("/service-delivery")}`,
    ].filter((line) => line !== null).join("\n"),
  });
}

module.exports = {
  MODEL_LABELS,
  TIER_LABELS,
  deliverPlatformRequestEmail,
  deliverRequesterDecisionEmail,
  platformAdminEmails,
};
