const InspectionJob = require("../models/inspectionJob");
const Invoice = require("../models/invoice");
const InvoiceReviewEmailAttempt = require("../models/invoiceReviewEmailAttempt");
const Submission = require("../models/submission");
const s3 = require("../awsConfig");
const { assignedPropertyManagers } = require("./apDeliveryNotifications");
const { emailPropertyManagersForReview } = require("./invoiceReview");

const RESEND_COOLDOWN_MS = 60 * 1000;

function resendError(message, status = 400, code = "INVOICE_REVIEW_RESEND_ERROR") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizedRecipientIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function validateResendInput({ recipientUserIds, reason, requestId }) {
  const selectedIds = normalizedRecipientIds(recipientUserIds);
  const safeReason = String(reason || "").trim();
  const safeRequestId = String(requestId || "").trim();
  if (!selectedIds.length) {
    throw resendError("Select at least one assigned property manager.");
  }
  if (!safeReason || safeReason.length > 500) {
    throw resendError("Enter a resend reason of 500 characters or fewer.");
  }
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(safeRequestId)) {
    throw resendError("The resend request identifier is invalid.");
  }
  return { selectedIds, reason: safeReason, requestId: safeRequestId };
}

function storageKeyFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return decodeURIComponent(url.pathname.replace(/^\/+/, "").replace(/\+/g, " "));
  } catch (_error) {
    return "";
  }
}

function safePdfFilename(value, fallback) {
  const name = String(value || fallback || "inspection-report.pdf")
    .replace(/[\r\n"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

async function inspectionPdfForInvoice(invoice, {
  SubmissionModel = Submission,
  InspectionJobModel = InspectionJob,
  storage = s3,
} = {}) {
  const submission = await SubmissionModel.findOne({
    _id: invoice.submissionId,
    organizationId: invoice.organizationId,
  }).select("processingJobId property pdfUrl").lean();
  if (!submission) {
    throw resendError(
      "The inspection submission associated with this invoice could not be found.",
      409,
      "INSPECTION_SUBMISSION_NOT_FOUND"
    );
  }

  const jobQuery = submission.processingJobId
    ? { _id: submission.processingJobId, submissionId: invoice.submissionId }
    : { submissionId: invoice.submissionId };
  const job = await InspectionJobModel.findOne(jobQuery)
    .select("pdfKey pdfFileName")
    .lean();
  const key = String(job?.pdfKey || storageKeyFromUrl(submission.pdfUrl)).trim();
  if (!key) {
    throw resendError(
      "The inspection report PDF is not available, so no email was sent.",
      409,
      "INSPECTION_REPORT_NOT_FOUND"
    );
  }

  let result;
  try {
    result = await storage.getObject({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    }).promise();
  } catch (_error) {
    throw resendError(
      "The inspection report PDF could not be loaded, so no email was sent.",
      409,
      "INSPECTION_REPORT_UNAVAILABLE"
    );
  }
  if (!result?.Body) {
    throw resendError(
      "The inspection report PDF is empty, so no email was sent.",
      409,
      "INSPECTION_REPORT_EMPTY"
    );
  }
  return {
    key,
    filename: safePdfFilename(
      job?.pdfFileName,
      `${submission.property || invoice.propertySnapshot?.name || "property"}-inspection-report.pdf`
    ),
    content: result.Body,
  };
}

function publicAttempt(attempt) {
  const value = attempt?.toObject ? attempt.toObject() : attempt;
  if (!value) return null;
  return {
    _id: value._id,
    invoiceId: value.invoiceId,
    reviewCycle: value.reviewCycle,
    requestId: value.requestId,
    reason: value.reason,
    status: value.status,
    recipients: (value.recipients || []).map((recipient) => ({
      userId: recipient.userId,
      email: recipient.email,
      status: recipient.status,
      providerMessageId: recipient.providerMessageId || "",
    })),
    acceptedAt: value.acceptedAt || null,
    completedAt: value.completedAt || null,
    createdAt: value.createdAt || null,
  };
}

function resultForExistingAttempt(previous) {
  if (previous.status === "sending") {
    throw resendError(
      "This resend request is already being processed.",
      409,
      "INVOICE_REVIEW_RESEND_IN_PROGRESS"
    );
  }
  if (previous.status === "failed") {
    const error = resendError(
      "The review email could not be sent to any selected recipient.",
      502,
      "INVOICE_REVIEW_RESEND_FAILED"
    );
    error.attempt = publicAttempt(previous);
    throw error;
  }
  return {
    attempt: publicAttempt(previous),
    duplicate: true,
    warning: previous.status === "partial_failure"
      ? "This resend request completed for only some selected recipients."
      : "",
  };
}

async function eligibleReviewRecipients(invoice, {
  findManagers = assignedPropertyManagers,
} = {}) {
  const managers = await findManagers(invoice, invoice.organizationId);
  return managers
    .filter((manager) => manager.email)
    .map((manager) => ({
      _id: manager._id,
      name: manager.username || manager.email,
      email: String(manager.email).trim().toLowerCase(),
    }));
}

async function invoiceStillAwaitingReview(invoice, { InvoiceModel = Invoice } = {}) {
  return Boolean(await InvoiceModel.findOne({
    _id: invoice._id,
    organizationId: invoice.organizationId,
    archivedAt: null,
    status: "pending_review",
    "review.cycle": invoice.review?.cycle,
  }).select("_id").lean());
}

async function resendInvoiceReviewEmail({
  invoice,
  recipientUserIds,
  reason,
  requestId,
  requestedBy,
}, {
  AttemptModel = InvoiceReviewEmailAttempt,
  findManagers = assignedPropertyManagers,
  loadInspectionPdf = inspectionPdfForInvoice,
  sendReviewEmail = emailPropertyManagersForReview,
  confirmPendingReview = invoiceStillAwaitingReview,
  now = () => new Date(),
} = {}) {
  if (invoice.status !== "pending_review") {
    throw resendError(
      "Only an invoice awaiting customer review can be resent.",
      409,
      "INVOICE_NOT_AWAITING_REVIEW"
    );
  }
  if (!invoice.pdfKey) {
    throw resendError(
      "The invoice PDF is not available, so no email was sent.",
      409,
      "INVOICE_PDF_NOT_FOUND"
    );
  }
  const input = validateResendInput({ recipientUserIds, reason, requestId });
  const previous = await AttemptModel.findOne({
    invoiceId: invoice._id,
    requestId: input.requestId,
  });
  if (previous) return resultForExistingAttempt(previous);

  const currentManagers = await findManagers(invoice, invoice.organizationId);
  const managerById = new Map(currentManagers
    .filter((manager) => manager.email)
    .map((manager) => [String(manager._id), manager]));
  const recipients = input.selectedIds.map((id) => managerById.get(id)).filter(Boolean);
  if (recipients.length !== input.selectedIds.length) {
    throw resendError(
      "One or more selected recipients are no longer active property managers for this property.",
      409,
      "INVOICE_REVIEW_RECIPIENT_CHANGED"
    );
  }

  const currentTime = now();
  const recent = await AttemptModel.findOne({
    invoiceId: invoice._id,
    status: { $in: ["sending", "accepted", "partial_failure"] },
    createdAt: { $gt: new Date(currentTime.getTime() - RESEND_COOLDOWN_MS) },
  }).sort({ createdAt: -1 });
  if (recent) {
    throw resendError(
      "A review email was recently resent for this invoice. Wait one minute before trying again.",
      429,
      "INVOICE_REVIEW_RESEND_COOLDOWN"
    );
  }

  const inspectionPdf = await loadInspectionPdf(invoice);
  if (!await confirmPendingReview(invoice)) {
    throw resendError(
      "This invoice is no longer awaiting the same customer review. No email was sent.",
      409,
      "INVOICE_REVIEW_CHANGED"
    );
  }
  let attempt;
  try {
    attempt = await AttemptModel.create({
      invoiceId: invoice._id,
      organizationId: invoice.organizationId,
      reviewCycle: invoice.review?.cycle,
      requestedBy,
      requestId: input.requestId,
      reason: input.reason,
      status: "sending",
      recipients: recipients.map((manager) => ({
        userId: manager._id,
        email: String(manager.email).trim().toLowerCase(),
        status: "pending",
      })),
      invoicePdfKey: invoice.pdfKey,
      inspectionPdfKey: inspectionPdf.key,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const concurrent = await AttemptModel.findOne({
      invoiceId: invoice._id,
      requestId: input.requestId,
    });
    if (!concurrent) throw error;
    return resultForExistingAttempt(concurrent);
  }

  const deliveries = await Promise.all(recipients.map(async (manager) => {
    try {
      const [delivery = {}] = await sendReviewEmail(invoice, [manager], {
        inspectionPdf,
        preserveExistingAuthorizationOnFailure: true,
        reviewAttemptId: attempt._id,
      });
      return {
        userId: manager._id,
        email: String(manager.email).trim().toLowerCase(),
        status: "accepted",
        providerMessageId: delivery.providerMessageId || "",
        acceptedAt: now(),
        failedAt: null,
        error: "",
      };
    } catch (_error) {
      return {
        userId: manager._id,
        email: String(manager.email).trim().toLowerCase(),
        status: "failed",
        providerMessageId: "",
        acceptedAt: null,
        failedAt: now(),
        error: "Review email delivery failed.",
      };
    }
  }));

  const acceptedCount = deliveries.filter((delivery) => delivery.status === "accepted").length;
  attempt.recipients = deliveries;
  attempt.status = acceptedCount === deliveries.length
    ? "accepted"
    : acceptedCount > 0 ? "partial_failure" : "failed";
  attempt.acceptedAt = acceptedCount ? now() : null;
  attempt.completedAt = now();
  attempt.error = acceptedCount === deliveries.length ? "" : "One or more review emails could not be sent.";
  await attempt.save();

  invoice.review.emailSentAt = acceptedCount ? now() : invoice.review.emailSentAt;
  invoice.review.emailError = attempt.error;
  await invoice.save();

  if (!acceptedCount) {
    const error = resendError(
      "The review email could not be sent to any selected recipient.",
      502,
      "INVOICE_REVIEW_RESEND_FAILED"
    );
    error.attempt = publicAttempt(attempt);
    throw error;
  }
  const warning = acceptedCount < deliveries.length
    ? `The review email was accepted for ${acceptedCount} of ${deliveries.length} recipients.`
    : "";
  return { attempt: publicAttempt(attempt), duplicate: false, warning };
}

module.exports = {
  RESEND_COOLDOWN_MS,
  eligibleReviewRecipients,
  inspectionPdfForInvoice,
  invoiceStillAwaitingReview,
  normalizedRecipientIds,
  publicAttempt,
  resultForExistingAttempt,
  resendInvoiceReviewEmail,
  storageKeyFromUrl,
  validateResendInput,
};
