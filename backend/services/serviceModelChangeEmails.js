const User = require("../models/user");
const { sendSystemEmail } = require("./systemEmail");
const { buildFrontendUrl } = require("../utils/frontendUrls");

const MODEL_LABELS = {
  platform: "Full-stack SaaS",
  managed: "Managed service",
  hybrid: "Hybrid",
};

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
    subject: `Service model change requested: ${organization.name}`,
    text: [
      `${requester.email} requested a service model change for ${organization.name}.`,
      "",
      `Current model: ${MODEL_LABELS[request.currentServiceModel]}`,
      `Requested model: ${MODEL_LABELS[request.requestedServiceModel]}`,
      `Proposed effective date: ${dateLabel(request.proposedEffectiveDate)}`,
      `Properties: ${request.organizationSnapshot.propertyCount}`,
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
    subject: `Service model request ${statusCopy}: ${organization.name}`,
    text: [
      `Your request to change ${organization.name} from ${MODEL_LABELS[request.currentServiceModel]} to ${MODEL_LABELS[request.requestedServiceModel]} was ${statusCopy}.`,
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
  deliverPlatformRequestEmail,
  deliverRequesterDecisionEmail,
  platformAdminEmails,
};
