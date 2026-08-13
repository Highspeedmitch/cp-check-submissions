const crypto = require("crypto");
const InvoiceEmailAuthorization = require("../models/invoiceEmailAuthorization");
const { buildFrontendUrl } = require("../utils/frontendUrls");
const { serviceModelAllowsAfterlightResources } = require("./fulfillmentPolicy");

const DEFAULT_EMAIL_APPROVAL_TOKEN_HOURS = 24;
const AUTHORIZATION_STAGE_LEASE_MS = 5 * 60 * 1000;

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
    && serviceModelAllowsAfterlightResources(organization)
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

async function stageEmailApprovalAuthorization({
  invoice,
  organization,
  manager,
  AuthorizationModel = InvoiceEmailAuthorization,
  randomBytes = crypto.randomBytes,
  now = new Date(),
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashEmailApprovalToken(token);
  const tokenHours = Number(organization?.billingCapabilities?.emailApprovalTokenHours)
    || DEFAULT_EMAIL_APPROVAL_TOKEN_HOURS;
  const expiresAt = new Date(now.getTime() + tokenHours * 60 * 60 * 1000);
  const reviewCycle = Number(invoice?.review?.cycle || 0);
  if (reviewCycle < 1) throw new Error("Invoice review cycle is not configured.");

  const query = {
    invoiceId: invoice._id,
    reviewerUserId: manager._id,
    reviewCycle,
  };
  const existing = await AuthorizationModel.findOne(query);
  if (!existing) {
    let authorization;
    try {
      authorization = await AuthorizationModel.create({
        ...query,
        organizationId: invoice.organizationId,
        reviewerEmail: String(manager.email || "").trim().toLowerCase(),
        tokenHash,
        status: "active",
        expiresAt,
        consumedAt: null,
        revokedAt: null,
        emailSentAt: null,
        providerMessageId: "",
        deliveryError: "",
        requestIpAddress: "",
        requestUserAgent: "",
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return stageEmailApprovalAuthorization({
        invoice,
        organization,
        manager,
        AuthorizationModel,
        randomBytes,
        now,
      });
    }
    return {
      authorization,
      token,
      url: emailApprovalUrl(token),
      async commit(result = {}) {
        const updated = await AuthorizationModel.findOneAndUpdate(
          { _id: authorization._id, tokenHash },
          {
            $set: {
              emailSentAt: new Date(),
              providerMessageId: result.messageId || "",
              deliveryError: "",
            },
          },
          { new: true }
        );
        if (!updated) throw new Error("The invoice approval link could not be activated.");
        return updated;
      },
      async rollback() {
        return AuthorizationModel.findOneAndUpdate(
          { _id: authorization._id, tokenHash, providerMessageId: "" },
          {
            $set: {
              status: "revoked",
              revokedAt: new Date(),
              deliveryError: "Review email delivery failed.",
            },
          },
          { new: true }
        );
      },
    };
  }

  const authorization = await AuthorizationModel.findOneAndUpdate(
    {
      _id: existing._id,
      $or: [
        { pendingExpiresAt: null },
        { pendingExpiresAt: { $exists: false } },
        { pendingExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        pendingTokenHash: tokenHash,
        pendingExpiresAt: new Date(now.getTime() + AUTHORIZATION_STAGE_LEASE_MS),
        deliveryError: "",
      },
    },
    { new: true }
  );
  if (!authorization) {
    throw new Error("Another invoice approval link refresh is already in progress.");
  }
  return {
    authorization,
    token,
    url: emailApprovalUrl(token),
    async commit(result = {}) {
      const updated = await AuthorizationModel.findOneAndUpdate(
        { _id: authorization._id, pendingTokenHash: tokenHash },
        {
          $set: {
            organizationId: invoice.organizationId,
            reviewerEmail: String(manager.email || "").trim().toLowerCase(),
            tokenHash,
            status: "active",
            expiresAt,
            consumedAt: null,
            revokedAt: null,
            emailSentAt: new Date(),
            providerMessageId: result.messageId || "",
            deliveryError: "",
            requestIpAddress: "",
            requestUserAgent: "",
          },
          $unset: {
            pendingTokenHash: "",
            pendingExpiresAt: "",
          },
        },
        { new: true }
      );
      if (!updated) throw new Error("The refreshed invoice approval link could not be activated.");
      return updated;
    },
    async rollback() {
      return AuthorizationModel.findOneAndUpdate(
        { _id: authorization._id, pendingTokenHash: tokenHash },
        {
          $set: { deliveryError: "Review email delivery failed." },
          $unset: {
            pendingTokenHash: "",
            pendingExpiresAt: "",
          },
        },
        { new: true }
      );
    },
  };
}

function maskEmailAddress(email) {
  const normalized = String(email || "").trim();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "Configured AP destination";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"\u2022".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

module.exports = {
  AUTHORIZATION_STAGE_LEASE_MS,
  DEFAULT_EMAIL_APPROVAL_TOKEN_HOURS,
  emailApprovalUrl,
  hashEmailApprovalToken,
  issueEmailApprovalAuthorization,
  stageEmailApprovalAuthorization,
  maskEmailAddress,
  secureEmailApprovalEligible,
  secureEmailApprovalEnabled,
};
