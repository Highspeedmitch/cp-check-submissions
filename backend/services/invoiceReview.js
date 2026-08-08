const { v4: uuidv4 } = require("uuid");
const User = require("../models/user");
const Organization = require("../models/organization");
const s3 = require("../awsConfig");
const { generateInvoicePDF } = require("../invoicePdfService");
const { sendUserNotification } = require("./notifications");
const { invoiceSubmittedForPropertyManager } = require("./notificationEvents");
const { buildFrontendUrl } = require("../utils/frontendUrls");
const { sendSystemEmail } = require("./systemEmail");
const {
  ensureInvoiceIssuerSnapshot,
  invoiceIssuer,
} = require("./invoiceIssuer");
const {
  issueEmailApprovalAuthorization,
  secureEmailApprovalEligible,
} = require("./invoiceEmailAuthorization");

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
  {
    inspectionPdf = null,
    sendEmail = sendSystemEmail,
    storage = s3,
    OrganizationModel = Organization,
    issueAuthorization = issueEmailApprovalAuthorization,
  } = {}
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
  const issuer = invoiceIssuer(invoice);
  const issuerName = escapeHtml(issuer.name);
  const invoiceDescription = issuer.type === "afterlight"
    ? "Afterlight invoice"
    : `invoice from ${issuer.name}, delivered via Afterlight`;
  const safeInvoiceDescription = issuer.type === "afterlight"
    ? "Afterlight invoice"
    : `invoice from <strong>${issuerName}</strong>, delivered via Afterlight`;
  const replyTo = issuer.type !== "afterlight" && issuer.email ? issuer.email : undefined;
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

  const organization = await OrganizationModel.findById(invoice.organizationId)
    .select("serviceModel billingCapabilities")
    .lean();
  if (secureEmailApprovalEligible(organization, invoice)) {
    const signedReviewUrl = buildFrontendUrl(`/billing/review/${invoice._id}`);
    const tokenHours = Number(organization.billingCapabilities?.emailApprovalTokenHours) || 24;
    await Promise.all(managers.filter((manager) => manager.email).map(async (manager) => {
      const issued = await issueAuthorization({ invoice, organization, manager });
      const approverName = escapeHtml(manager.username || manager.email);
      const safeApprovalUrl = escapeHtml(issued.url);
      const safeSignedReviewUrl = escapeHtml(signedReviewUrl);
      try {
        const result = await sendEmail({
          to: manager.email,
          ...(replyTo ? { replyTo } : {}),
          subject: `Approval requested: ${issuer.name} inspection invoice ${invoice.invoiceNumber}`,
          text: [
            `Hello ${manager.username || "Property Manager"},`,
            `The inspection report and ${invoiceDescription} ${invoice.invoiceNumber} for ${invoice.propertySnapshot.name} are ready for review.`,
            `Amount: ${amount}`,
            `Inspection date: ${new Date(invoice.inspectionDate).toLocaleDateString("en-US")}`,
            `Approve and send to AP: ${issued.url}`,
            `Review or decline in Afterlight: ${signedReviewUrl}`,
            `The approval link expires in ${tokenHours} hours and can be used once.`,
          ].join("\n"),
          html: `
            <p>Hello ${approverName},</p>
            <p>The inspection report and ${safeInvoiceDescription} <strong>${invoiceNumber}</strong> for
            <strong>${propertyName}</strong> are ready for review.</p>
            <p>Amount: <strong>${amount}</strong><br>
            Inspection date: ${new Date(invoice.inspectionDate).toLocaleDateString("en-US")}</p>
            <p><a href="${safeApprovalUrl}" style="display:inline-block;padding:12px 18px;background:#087df1;color:#fff;text-decoration:none;border-radius:6px">
            Approve &amp; Send to AP</a></p>
            <p><a href="${safeSignedReviewUrl}">Review or decline in Afterlight</a></p>
            <p>The approval link expires in ${tokenHours} hours and can be used once. Opening the link does not approve the invoice; you will confirm the action on a secure Afterlight page.</p>
          `,
          attachments,
        });
        issued.authorization.emailSentAt = new Date();
        issued.authorization.providerMessageId = result?.messageId || "";
        await issued.authorization.save();
      } catch (error) {
        issued.authorization.deliveryError = "Review email delivery failed.";
        await issued.authorization.save().catch(() => {});
        throw error;
      }
    }));
    return;
  }

  await sendEmail({
    to: process.env.SYSTEM_EMAIL_ADDRESS,
    bcc: recipients.join(","),
    ...(replyTo ? { replyTo } : {}),
    subject: `Review requested: ${issuer.name} inspection invoice ${invoice.invoiceNumber}`,
    text: [
      `The inspection report and ${invoiceDescription} ${invoice.invoiceNumber} for ${invoice.propertySnapshot.name} are ready for review.`,
      `Amount: ${amount}`,
      `Inspection date: ${new Date(invoice.inspectionDate).toLocaleDateString("en-US")}`,
      `Review and approve or decline: ${reviewUrl}`,
    ].join("\n"),
    html: `
      <p>The inspection report and ${safeInvoiceDescription} <strong>${invoiceNumber}</strong> for
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
  await ensureInvoiceIssuerSnapshot(invoice);
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
  invoice.amountSetBySubmitter = false;
  if (invoice.billingOwner === "afterlight_platform") {
    invoice.platformPreparation.preparedAt = new Date();
  }
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
  invoice.status = "pending_review";
  invoice.review.cycle = Number(invoice.review.cycle || 0) + 1;
  invoice.review.requestedBy = requestedBy || null;
  invoice.review.requestedAt = new Date();
  invoice.review.reviewedBy = null;
  invoice.review.reviewedAt = null;
  invoice.review.decision = "";
  invoice.review.method = "";
  invoice.review.approverSnapshot = { name: "", email: "" };
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
  invoice.billingOwner = "afterlight_platform";
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

async function prepareCustomerContractorInvoiceForReview(invoice, options = {}) {
  if (!invoice || invoice.fulfillmentSnapshot?.invoiceRouting !== "customer_accounts_payable") {
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
  prepareCustomerContractorInvoiceForReview,
};
