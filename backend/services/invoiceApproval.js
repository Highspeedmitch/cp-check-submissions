const Invoice = require("../models/invoice");
const User = require("../models/user");
const { sendUserNotification } = require("./notifications");
const { invoiceReviewChanged } = require("./notificationEvents");
const { evaluateOrganizationBillingAction } = require("./billingPolicy");
const { sendApprovedInvoiceToAp } = require("./apDelivery");
const { apDeliveryFailure } = require("./apDeliveryErrors");
const { notifyApDeliveryState } = require("./apDeliveryNotifications");
const { isAfterlightServiceInvoice } = require("./serviceBilling");

function approvalError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function loadApproverSnapshot(actor, organizationId, UserModel = User) {
  const reviewer = await UserModel.findOne({
    _id: actor.userId,
    organizationId,
    role: "property_manager",
    accountStatus: { $ne: "inactive" },
    organizationArchivedAt: null,
  }).select("_id username email role").lean();
  if (!reviewer?.username || !reviewer?.email) {
    throw approvalError(
      "The approving property manager must have a configured name and email address.",
      409,
      "APPROVER_CONTACT_REQUIRED"
    );
  }
  return {
    name: String(reviewer.username).trim(),
    email: String(reviewer.email).trim().toLowerCase(),
  };
}

async function approveInvoiceAndSendToAp({
  invoiceId,
  organizationId,
  actor,
  approvalMethod = "authenticated_portal",
  confirmationNumber = "",
  allowDeliveryRetry = true,
  InvoiceModel = Invoice,
  UserModel = User,
  evaluateAction = evaluateOrganizationBillingAction,
  deliverToAp = sendApprovedInvoiceToAp,
  notifyDeliveryState = notifyApDeliveryState,
  notifyUser = sendUserNotification,
}) {
  const allowedStatuses = allowDeliveryRetry
    ? ["pending_review", "failed"]
    : ["pending_review"];
  const existingInvoice = await InvoiceModel.findOne({
    _id: invoiceId,
    organizationId,
    status: { $in: allowedStatuses },
  });
  if (!existingInvoice) {
    throw approvalError(
      "This invoice is no longer awaiting approval.",
      409,
      "INVOICE_NOT_AWAITING_APPROVAL"
    );
  }

  const decision = await evaluateAction({
    organizationId,
    action: "review_invoice",
    user: actor,
    invoice: existingInvoice,
  });
  if (!decision.allowed) throw approvalError(decision.reason, 403, "INVOICE_REVIEW_FORBIDDEN");

  const retryingDelivery = existingInvoice.status === "failed"
    && existingInvoice.review?.decision === "approved";
  const hasStoredApprover = Boolean(
    existingInvoice.review?.approverSnapshot?.name
    && existingInvoice.review?.approverSnapshot?.email
  );
  const approverSnapshot = retryingDelivery && hasStoredApprover
    ? {
        name: existingInvoice.review.approverSnapshot.name,
        email: existingInvoice.review.approverSnapshot.email,
      }
    : await loadApproverSnapshot(actor, organizationId, UserModel);

  const setValues = {
    status: "approving",
    "delivery.error": "",
  };
  const history = [];
  if (!retryingDelivery) {
    Object.assign(setValues, {
      "review.reviewedBy": actor.userId,
      "review.reviewedAt": new Date(),
      "review.decision": "approved",
      "review.method": approvalMethod,
      "review.approverSnapshot.name": approverSnapshot.name,
      "review.approverSnapshot.email": approverSnapshot.email,
      "review.declineReason": "",
    });
    history.push({ status: "approved", changedBy: actor.userId });
  } else if (!hasStoredApprover) {
    Object.assign(setValues, {
      "review.approverSnapshot.name": approverSnapshot.name,
      "review.approverSnapshot.email": approverSnapshot.email,
    });
  }

  let invoice = await InvoiceModel.findOneAndUpdate(
    {
      _id: existingInvoice._id,
      organizationId,
      status: existingInvoice.status,
    },
    {
      $set: setValues,
      ...(history.length ? { $push: { statusHistory: { $each: history } } } : {}),
    },
    { new: true }
  );
  if (!invoice) {
    throw approvalError(
      "Another reviewer has already acted on this invoice.",
      409,
      "INVOICE_ALREADY_REVIEWED"
    );
  }

  try {
    const deliveryResult = await deliverToAp(invoice, String(confirmationNumber || "").trim());
    invoice.status = "submitted";
    invoice.statusHistory.push({ status: "submitted", changedBy: actor.userId });
    await invoice.save();

    if (deliveryResult.status === "accepted") {
      notifyDeliveryState(invoice, "queued").catch(() => {});
    } else if (!isAfterlightServiceInvoice(invoice)) {
      notifyUser({
        organizationId,
        userId: invoice.submitterId,
        ...invoiceReviewChanged(invoice, "approved"),
      }).catch(() => {});
    }
    return { invoice, deliveryResult };
  } catch (error) {
    const failure = apDeliveryFailure(error);
    invoice.status = "failed";
    invoice.delivery.status = "failed";
    invoice.delivery.failedAt = new Date();
    invoice.delivery.error = failure.userMessage;
    invoice.delivery.errorCode = failure.errorCode;
    invoice.statusHistory.push({ status: "failed", changedBy: actor.userId });
    await invoice.save().catch(() => {});
    notifyDeliveryState(invoice, "failed").catch(() => {});
    const deliveryError = approvalError(failure.userMessage, failure.status, failure.errorCode);
    deliveryError.deliveryFailure = failure;
    deliveryError.invoice = invoice;
    throw deliveryError;
  }
}

module.exports = {
  approveInvoiceAndSendToAp,
  approvalError,
  loadApproverSnapshot,
};
