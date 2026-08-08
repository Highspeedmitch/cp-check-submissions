const crypto = require("crypto");
const InvoiceEmailAuthorization = require("../models/invoiceEmailAuthorization");
const { buildFrontendUrl } = require("../utils/frontendUrls");

const DEFAULT_EMAIL_APPROVAL_TOKEN_HOURS = 24;

function hashEmailApprovalToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function secureEmailApprovalEnabled(organization) {
  return organization?.billingCapabilities?.invoiceApprovalExperience === "secure_email_link";
}

function secureEmailApprovalEligible(organization, invoice) {
  const invoiceRouting = invoice?.fulfillmentSnapshot?.invoiceRouting;
  const reviewableInvoice = [
    "afterlight_service_billing",
    "customer_accounts_payable",
  ].includes(invoiceRouting)
    || invoice?.billingOwner === "afterlight_platform";
  return secureEmailApprovalEnabled(organization)
    && ["managed", "hybrid"].includes(organization?.serviceModel || "managed")
    && reviewableInvoice
    && invoice?.propertySnapshot?.apMethod === "email"
    && Boolean(String(invoice?.propertySnapshot?.apEmail || "").trim());
}

function emailApprovalUrl(token, environment = process.env) {
  return buildFrontendUrl(
    `/billing/email-approval#token=${encodeURIComponent(token)}`,
    environment
  );
}

async function issueEmailApprovalAuthorization({
  invoice,
  organization,
  manager,
  AuthorizationModel = InvoiceEmailAuthorization,
  randomBytes = crypto.randomBytes,
  now = new Date(),
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHours = Number(organization?.billingCapabilities?.emailApprovalTokenHours)
    || DEFAULT_EMAIL_APPROVAL_TOKEN_HOURS;
  const expiresAt = new Date(now.getTime() + tokenHours * 60 * 60 * 1000);
  const reviewCycle = Number(invoice?.review?.cycle || 0);
  if (reviewCycle < 1) throw new Error("Invoice review cycle is not configured.");

  const authorization = await AuthorizationModel.findOneAndUpdate(
    {
      invoiceId: invoice._id,
      reviewerUserId: manager._id,
      reviewCycle,
    },
    {
      $set: {
        organizationId: invoice.organizationId,
        reviewerEmail: String(manager.email || "").trim().toLowerCase(),
        tokenHash: hashEmailApprovalToken(token),
        status: "active",
        expiresAt,
        consumedAt: null,
        revokedAt: null,
        emailSentAt: null,
        providerMessageId: "",
        deliveryError: "",
        requestIpAddress: "",
        requestUserAgent: "",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return { authorization, token, url: emailApprovalUrl(token) };
}

function maskEmailAddress(email) {
  const normalized = String(email || "").trim();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "Configured AP destination";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"\u2022".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

module.exports = {
  DEFAULT_EMAIL_APPROVAL_TOKEN_HOURS,
  emailApprovalUrl,
  hashEmailApprovalToken,
  issueEmailApprovalAuthorization,
  maskEmailAddress,
  secureEmailApprovalEligible,
  secureEmailApprovalEnabled,
};
