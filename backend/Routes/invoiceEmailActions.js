const express = require("express");
const Invoice = require("../models/invoice");
const InvoiceEmailAuthorization = require("../models/invoiceEmailAuthorization");
const Organization = require("../models/organization");
const User = require("../models/user");
const { evaluateOrganizationBillingAction } = require("../services/billingPolicy");
const { approveInvoiceAndSendToAp, approvalError } = require("../services/invoiceApproval");
const {
  hashEmailApprovalToken,
  maskEmailAddress,
  secureEmailApprovalEligible,
  secureEmailApprovalEnabled,
} = require("../services/invoiceEmailAuthorization");

const router = express.Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  next();
});

function tokenFromRequest(req) {
  const token = String(req.body?.token || "").trim();
  return /^[A-Za-z0-9_-]{40,100}$/.test(token) ? token : "";
}

function publicInvoiceDetails(invoice, authorization) {
  const decision = invoice.review?.decision || "";
  return {
    invoiceNumber: invoice.invoiceNumber,
    propertyName: invoice.propertySnapshot?.name,
    propertyCode: invoice.propertySnapshot?.propertyCode,
    amountCents: invoice.amountCents,
    inspectionDate: invoice.inspectionDate,
    apDestination: maskEmailAddress(invoice.propertySnapshot?.apEmail),
    status: invoice.status,
    decision,
    reviewedAt: invoice.review?.reviewedAt || null,
    approvedBy: decision === "approved"
      ? invoice.review?.approverSnapshot?.name || "the assigned property manager"
      : "",
    authorizationStatus: authorization.status,
  };
}

async function loadContext(req, { requireActionable = false } = {}) {
  const token = tokenFromRequest(req);
  if (!token) throw approvalError("This approval link is invalid or incomplete.", 400, "INVALID_APPROVAL_LINK");
  const authorization = await InvoiceEmailAuthorization.findOne({
    tokenHash: hashEmailApprovalToken(token),
  });
  if (!authorization) {
    throw approvalError("This approval link is invalid or has expired.", 404, "APPROVAL_LINK_NOT_FOUND");
  }

  const [invoice, organization, reviewer] = await Promise.all([
    Invoice.findOne({
      _id: authorization.invoiceId,
      organizationId: authorization.organizationId,
    }),
    Organization.findById(authorization.organizationId),
    User.findOne({
      _id: authorization.reviewerUserId,
      organizationId: authorization.organizationId,
      role: "property_manager",
      accountStatus: { $ne: "inactive" },
      organizationArchivedAt: null,
    }).select("_id username email role"),
  ]);
  if (!invoice || !organization || !reviewer) {
    throw approvalError("This approval link is no longer authorized.", 410, "APPROVAL_LINK_REVOKED");
  }
  if (!secureEmailApprovalEnabled(organization)) {
    throw approvalError("Email invoice approval is no longer enabled for this organization.", 410, "EMAIL_APPROVAL_DISABLED");
  }
  if (!secureEmailApprovalEligible(organization, invoice)) {
    throw approvalError("This invoice must now be reviewed in Afterlight.", 409, "EMAIL_APPROVAL_INELIGIBLE");
  }
  if (String(reviewer.email || "").trim().toLowerCase() !== authorization.reviewerEmail) {
    throw approvalError("The approving property manager's email has changed. Review this invoice in Afterlight.", 409, "REVIEWER_EMAIL_CHANGED");
  }
  if (Number(invoice.review?.cycle || 0) !== authorization.reviewCycle) {
    throw approvalError("This invoice has been revised. Use the newest review email.", 409, "STALE_REVIEW_CYCLE");
  }
  if (authorization.status === "revoked") {
    throw approvalError("This approval link has been revoked.", 410, "APPROVAL_LINK_REVOKED");
  }
  if (new Date(authorization.expiresAt) <= new Date()) {
    throw approvalError("This approval link has expired. Review the invoice in Afterlight.", 410, "APPROVAL_LINK_EXPIRED");
  }

  const actor = {
    userId: reviewer._id,
    organizationId: organization._id,
    role: reviewer.role,
  };
  const policyDecision = await evaluateOrganizationBillingAction({
    organizationId: organization._id,
    action: "review_invoice",
    user: actor,
    invoice,
  });
  if (!policyDecision.allowed) {
    throw approvalError(policyDecision.reason, 403, "INVOICE_REVIEW_FORBIDDEN");
  }
  if (requireActionable && authorization.status !== "active") {
    throw approvalError("This approval link has already been used.", 409, "APPROVAL_LINK_USED");
  }
  if (requireActionable && invoice.status !== "pending_review") {
    throw approvalError("This invoice is no longer awaiting approval.", 409, "INVOICE_NOT_AWAITING_APPROVAL");
  }
  return { token, authorization, invoice, organization, reviewer, actor };
}

router.post("/resolve", async (req, res) => {
  try {
    const context = await loadContext(req);
    return res.json({
      invoice: publicInvoiceDetails(context.invoice, context.authorization),
      canApprove: context.authorization.status === "active"
        && context.invoice.status === "pending_review",
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to open this invoice approval.",
      code: error.code || "EMAIL_APPROVAL_ERROR",
    });
  }
});

router.post("/approve", async (req, res) => {
  let context;
  try {
    context = await loadContext(req, { requireActionable: true });
    const consumed = await InvoiceEmailAuthorization.findOneAndUpdate(
      {
        _id: context.authorization._id,
        status: "active",
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: "consumed",
          consumedAt: new Date(),
          requestIpAddress: req.ip || "",
          requestUserAgent: req.get("user-agent") || "",
        },
      },
      { new: true }
    );
    if (!consumed) {
      throw approvalError("This approval link has already been used.", 409, "APPROVAL_LINK_USED");
    }

    const { invoice, deliveryResult } = await approveInvoiceAndSendToAp({
      invoiceId: context.invoice._id,
      organizationId: context.organization._id,
      actor: context.actor,
      approvalMethod: "secure_email_link",
      allowDeliveryRetry: false,
    });
    await InvoiceEmailAuthorization.updateMany(
      {
        invoiceId: invoice._id,
        reviewCycle: context.authorization.reviewCycle,
        _id: { $ne: consumed._id },
        status: "active",
      },
      { $set: { status: "revoked", revokedAt: new Date() } }
    );
    return res.json({
      invoice: publicInvoiceDetails(invoice, consumed),
      message: deliveryResult.warning || "Invoice approved and sent to accounts payable.",
    });
  } catch (error) {
    if (error.invoice?.review?.decision === "approved" && context?.authorization) {
      await InvoiceEmailAuthorization.updateMany(
        {
          invoiceId: context.authorization.invoiceId,
          reviewCycle: context.authorization.reviewCycle,
          status: "active",
        },
        { $set: { status: "revoked", revokedAt: new Date() } }
      ).catch(() => {});
      return res.status(error.status || 502).json({
        error: "The invoice was approved, but delivery to AP failed. Afterlight has been notified and the link cannot be reused.",
        code: "AP_DELIVERY_FAILED_AFTER_APPROVAL",
        approvalRecorded: true,
        invoice: publicInvoiceDetails(error.invoice, { status: "consumed" }),
      });
    }
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to approve and send this invoice.",
      code: error.code || "EMAIL_APPROVAL_ERROR",
    });
  }
});

module.exports = router;
module.exports.loadContext = loadContext;
module.exports.publicInvoiceDetails = publicInvoiceDetails;
