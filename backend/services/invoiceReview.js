const { v4: uuidv4 } = require("uuid");
const User = require("../models/user");
const Organization = require("../models/organization");
const s3 = require("../awsConfig");
const { generateInvoicePDF } = require("../invoicePdfService");
const { sendUserNotification } = require("./notifications");
const { invoiceSubmittedForPropertyManager } = require("./notificationEvents");
const { buildFrontendUrl } = require("../utils/frontendUrls");
const { sendSystemEmail } = require("./systemEmail");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function invoiceConfigurationError(message) {
  const error = new Error(message);
  error.configuration = true;
  return error;
}

async function assignedPropertyManagers(
  invoice,
  organizationId,
  { OrganizationModel = Organization, UserModel = User } = {}
) {
  const organization = await OrganizationModel.findById(organizationId)
    .select("properties._id properties.propertyManagers")
    .lean();
  const property = (organization?.properties || []).find(
    (item) => item._id.toString() === invoice.propertyId.toString()
  );
  const assignedIds = [...new Set(
    (property?.propertyManagers || []).map((id) => id.toString())
  )];
  if (!assignedIds.length) return [];

  return UserModel.find({
    _id: { $in: assignedIds },
    organizationId,
    role: "property_manager",
    accountStatus: { $ne: "inactive" },
    organizationArchivedAt: null,
  }).select("_id username email").lean();
}

async function notifyPropertyManagersOfSubmittedInvoice(
  invoice,
  organizationId,
  managers,
  { notify = sendUserNotification } = {}
) {
  const event = invoiceSubmittedForPropertyManager(invoice);
  await Promise.allSettled(managers.map((manager) => notify({
    organizationId,
    userId: manager._id,
    ...event,
  })));
}

async function emailPropertyManagersForReview(
  invoice,
  managers,
  { inspectionPdf = null, sendEmail = sendSystemEmail, storage = s3 } = {}
) {
  const recipients = managers.map((manager) => manager.email).filter(Boolean);
  if (!recipients.length) return;
  const file = await storage.getObject({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: invoice.pdfKey,
  }).promise();
  const reviewUrl = buildFrontendUrl(`/billing/review/${invoice._id}`);
  const invoiceNumber = escapeHtml(invoice.invoiceNumber);
  const propertyName = escapeHtml(invoice.propertySnapshot.name);
  const safeReviewUrl = escapeHtml(reviewUrl);
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(invoice.amountCents / 100);
  const attachments = [{
    filename: `${invoice.invoiceNumber}.pdf`,
    content: file.Body,
    contentType: "application/pdf",
  }];
  if (inspectionPdf?.content) attachments.push({
    filename: inspectionPdf.filename || "inspection-report.pdf",
    content: inspectionPdf.content,
    contentType: "application/pdf",
  });
  await sendEmail({
    to: process.env.SYSTEM_EMAIL_ADDRESS,
    bcc: recipients.join(","),
    subject: `Review requested: inspection and invoice ${invoice.invoiceNumber}`,
    text: [
      `The inspection report and Afterlight invoice ${invoice.invoiceNumber} for ${invoice.propertySnapshot.name} are ready for review.`,
      `Amount: ${amount}`,
      `Inspection date: ${new Date(invoice.inspectionDate).toLocaleDateString("en-US")}`,
      `Review and approve or decline: ${reviewUrl}`,
    ].join("\n"),
    html: `
      <p>The inspection report and Afterlight invoice <strong>${invoiceNumber}</strong> for
      <strong>${propertyName}</strong> are ready for review.</p>
      <p>Amount: <strong>${amount}</strong><br>
      Inspection date: ${new Date(invoice.inspectionDate).toLocaleDateString("en-US")}</p>
      <p><a href="${safeReviewUrl}" style="display:inline-block;padding:12px 18px;background:#087df1;color:#fff;text-decoration:none;border-radius:6px">
      Review Invoice</a></p>
      <p>You will be asked to sign in if your Afterlight session is not active.</p>
    `,
    attachments,
  });
}

async function generateInvoiceDocument(
  invoice,
  { generatePdf = generateInvoicePDF, storage = s3, createId = uuidv4 } = {}
) {
  if (!invoice.amountCents) {
    throw invoiceConfigurationError("Configure the customer inspection amount before automatic billing can continue.");
  }
  if (!invoice.propertySnapshot?.propertyCode) {
    throw invoiceConfigurationError("Configure the property's billing code before automatic billing can continue.");
  }
  if (!invoice.invoiceNumber) {
    invoice.invoiceNumber = `${invoice.propertySnapshot.propertyCode}-${Date.now()}`;
  }
  const buffer = await generatePdf(invoice);
  const key = `${invoice.organizationId}/invoices/${createId()}-${invoice.invoiceNumber}.pdf`;
  await storage.upload({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: "application/pdf",
    ACL: "private",
  }).promise();
  invoice.pdfKey = key;
  invoice.billingOwner = "afterlight_platform";
  invoice.amountSetBySubmitter = false;
  invoice.platformPreparation.preparedAt = new Date();
  await invoice.save();
  return invoice;
}

async function submitInvoiceForReview(
  invoice,
  {
    organizationId = invoice.organizationId,
    requestedBy = null,
    inspectionPdf = null,
    findManagers = assignedPropertyManagers,
    notifyManagers = notifyPropertyManagersOfSubmittedInvoice,
    emailManagers = emailPropertyManagersForReview,
  } = {}
) {
  const managers = await findManagers(invoice, organizationId);
  if (!managers.length) {
    throw invoiceConfigurationError(
      "Assign an active property manager before automatic billing can continue."
    );
  }
  invoice.billingOwner = "afterlight_platform";
  invoice.status = "pending_review";
  invoice.review.requestedBy = requestedBy || null;
  invoice.review.requestedAt = new Date();
  invoice.review.reviewedBy = null;
  invoice.review.reviewedAt = null;
  invoice.review.decision = "";
  invoice.review.declineReason = "";
  invoice.review.emailSentAt = null;
  invoice.review.emailError = "";
  const history = { status: "pending_review" };
  if (requestedBy) history.changedBy = requestedBy;
  invoice.statusHistory.push(history);
  await invoice.save();
  await notifyManagers(invoice, organizationId, managers);
  let warning = "";
  try {
    await emailManagers(invoice, managers, { inspectionPdf });
    invoice.review.emailSentAt = new Date();
  } catch (error) {
    console.error("Automatic service invoice review email error:", error.message);
    invoice.review.emailError = "Review email delivery failed.";
    warning = "The invoice is awaiting PM review, but the review email could not be delivered. The PM was still notified in the app.";
  }
  await invoice.save();
  return { invoice, warning };
}

async function prepareAfterlightServiceInvoiceForReview(invoice, options = {}) {
  if (!invoice || invoice.fulfillmentSnapshot?.invoiceRouting !== "afterlight_service_billing") {
    return { invoice, prepared: false, warning: "" };
  }
  if (invoice.status !== "unbilled") {
    return { invoice, prepared: false, warning: "" };
  }
  if (!invoice.pdfKey) {
    try {
      await generateInvoiceDocument(invoice, options);
    } catch (error) {
      if (!error.configuration) throw error;
      invoice.review.emailError = error.message;
      await invoice.save();
      return { invoice, prepared: false, warning: error.message };
    }
  }
  try {
    const result = await submitInvoiceForReview(invoice, options);
    return { ...result, prepared: true };
  } catch (error) {
    if (!error.configuration) throw error;
    invoice.review.emailError = error.message;
    await invoice.save();
    return { invoice, prepared: false, warning: error.message };
  }
}

module.exports = {
  assignedPropertyManagers,
  notifyPropertyManagersOfSubmittedInvoice,
  emailPropertyManagersForReview,
  generateInvoiceDocument,
  submitInvoiceForReview,
  prepareAfterlightServiceInvoiceForReview,
};
