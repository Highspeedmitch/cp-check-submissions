const s3 = require("../awsConfig");
const { sendSystemEmail } = require("./systemEmail");
const { normalizeEmailAddress } = require("./propertyEmails");

function nowFrom(value) {
  return typeof value === "function" ? value() : new Date();
}

async function sendApprovedInvoiceToAp(
  invoice,
  confirmationNumber = "",
  { storage = s3, sendEmail = sendSystemEmail, now } = {}
) {
  const method = invoice.propertySnapshot.apMethod || "download";
  const attemptedAt = nowFrom(now);

  invoice.delivery.method = method;
  invoice.delivery.lastAttemptAt = attemptedAt;
  invoice.delivery.attemptCount = (invoice.delivery.attemptCount || 0) + 1;
  invoice.delivery.error = "";
  invoice.delivery.errorCode = "";
  invoice.delivery.failedAt = null;

  if (method === "email") {
    invoice.delivery.status = "sending";
    const destination = normalizeEmailAddress(
      invoice.propertySnapshot.apEmail,
      "AP email address"
    );
    invoice.delivery.destination = destination;

    const file = await storage.getObject({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: invoice.pdfKey,
    }).promise();
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(invoice.amountCents / 100);
    const result = await sendEmail({
      to: destination,
      subject: `Approved property inspection invoice ${invoice.invoiceNumber}`,
      text: [
        `Invoice ${invoice.invoiceNumber} for ${invoice.propertySnapshot.name} has been reviewed and approved by the assigned property manager.`,
        `Property code: ${invoice.propertySnapshot.propertyCode}`,
        `Approved amount: ${amount}`,
        `Inspection date: ${new Date(invoice.inspectionDate).toLocaleDateString("en-US")}`,
        "The approved invoice is attached for processing.",
      ].join("\n"),
      attachments: [{
        filename: `${invoice.invoiceNumber}.pdf`,
        content: file.Body,
        contentType: "application/pdf",
      }],
    });
    if (!result?.accepted) {
      const error = new Error("The AP email provider did not accept the message.");
      error.code = "EMAIL_NOT_ACCEPTED";
      throw error;
    }

    const acceptedAt = nowFrom(now);
    invoice.delivery.status = "accepted";
    invoice.delivery.provider = result.provider || "unknown";
    invoice.delivery.providerMessageId = result.messageId || "";
    invoice.delivery.acceptedAt = acceptedAt;
    // Retained for backwards compatibility. For email, this means the provider
    // accepted the message; it does not prove mailbox delivery.
    invoice.delivery.sentAt = acceptedAt;
    return {
      status: "accepted",
      warning: "Invoice approved and queued with the AP email provider. Final mailbox delivery is not yet confirmed.",
    };
  }

  invoice.delivery.destination = invoice.propertySnapshot.apPortal || "Manual AP submission";
  invoice.delivery.confirmationNumber = confirmationNumber;
  invoice.delivery.status = "recorded";
  invoice.delivery.provider = "manual";
  invoice.delivery.providerMessageId = "";
  invoice.delivery.acceptedAt = attemptedAt;
  invoice.delivery.sentAt = attemptedAt;
  return { status: "recorded", warning: "" };
}

module.exports = { sendApprovedInvoiceToAp };
