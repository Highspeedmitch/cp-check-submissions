const test = require("node:test");
const assert = require("node:assert/strict");
const {
  emailPropertyManagersForReview,
  prepareAfterlightServiceInvoiceForReview,
} = require("../services/invoiceReview");

function invoice(overrides = {}) {
  return {
    _id: "invoice-1",
    organizationId: "org-1",
    propertyId: "property-1",
    amountCents: 22500,
    billingOwner: "afterlight_platform",
    invoiceNumber: "",
    pdfKey: "",
    status: "unbilled",
    propertySnapshot: { name: "Winterhaven Square", propertyCode: "WH01" },
    fulfillmentSnapshot: { invoiceRouting: "afterlight_service_billing" },
    platformPreparation: {},
    review: {},
    statusHistory: [],
    save: async function save() { this.saved = (this.saved || 0) + 1; },
    ...overrides,
  };
}

test("Afterlight service invoices are generated and sent directly to PM review", async () => {
  const record = invoice();
  let uploaded;
  let notified = false;
  let emailedInspection;
  const result = await prepareAfterlightServiceInvoiceForReview(record, {
    requestedBy: null,
    inspectionPdf: { filename: "inspection.pdf", content: Buffer.from("inspection") },
    generatePdf: async () => Buffer.from("invoice"),
    createId: () => "document-1",
    storage: {
      upload(params) {
        uploaded = params;
        return { promise: async () => ({}) };
      },
    },
    findManagers: async () => [{ _id: "pm-1", email: "pm@example.com" }],
    notifyManagers: async () => { notified = true; },
    emailManagers: async (_invoice, _managers, options) => {
      emailedInspection = options.inspectionPdf;
    },
  });

  assert.equal(result.prepared, true);
  assert.equal(record.status, "pending_review");
  assert.equal(record.review.cycle, 1);
  assert.equal(record.billingOwner, "afterlight_platform");
  assert.equal(record.amountSetBySubmitter, false);
  assert.match(record.pdfKey, /document-1/);
  assert.equal(uploaded.ContentType, "application/pdf");
  assert.equal(notified, true);
  assert.equal(emailedInspection.filename, "inspection.pdf");
});

test("missing billing configuration leaves a visible platform exception without blocking submission", async () => {
  const record = invoice({ amountCents: null });
  const result = await prepareAfterlightServiceInvoiceForReview(record, {
    generatePdf: async () => assert.fail("PDF generation should not run"),
  });
  assert.equal(result.prepared, false);
  assert.match(result.warning, /customer inspection amount/i);
  assert.match(record.review.emailError, /customer inspection amount/i);
  assert.equal(record.status, "unbilled");
});

test("secure email approval sends each property manager an individual one-time link", async () => {
  const record = invoice({
    invoiceNumber: "INV-22",
    pdfKey: "invoice.pdf",
    inspectionDate: new Date("2026-08-07T12:00:00Z"),
    review: { cycle: 2 },
    propertySnapshot: {
      name: "Winterhaven Square",
      propertyCode: "WH01",
      apMethod: "email",
      apEmail: "ap@client.example",
    },
  });
  const messages = [];
  let issued = 0;

  await emailPropertyManagersForReview(record, [
    { _id: "pm-1", username: "Jordan Lee", email: "jordan@client.example" },
    { _id: "pm-2", username: "Taylor Kim", email: "taylor@client.example" },
  ], {
    inspectionPdf: { filename: "inspection.pdf", content: Buffer.from("inspection") },
    storage: {
      getObject: () => ({ promise: async () => ({ Body: Buffer.from("invoice") }) }),
    },
    OrganizationModel: {
      findById: () => ({
        select: () => ({
          lean: async () => ({
            serviceModel: "managed",
            billingCapabilities: {
              invoiceApprovalExperience: "secure_email_link",
              emailApprovalTokenHours: 24,
            },
          }),
        }),
      }),
    },
    issueAuthorization: async ({ manager }) => {
      issued += 1;
      return {
        url: `https://app.example/billing/email-approval#token=token-${manager._id}`,
        authorization: {
          save: async () => {},
        },
      };
    },
    sendEmail: async (options) => {
      messages.push(options);
      return { messageId: `message-${messages.length}` };
    },
  });

  assert.equal(issued, 2);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map((message) => message.to), [
    "jordan@client.example",
    "taylor@client.example",
  ]);
  assert.equal(messages.some((message) => message.bcc), false);
  assert.equal(messages[0].attachments.length, 2);
  assert.match(messages[0].html, /Approve &amp; Send to AP/);
  assert.match(messages[0].html, /Opening the link does not approve/);
});

test("the default organization experience retains authenticated review", async () => {
  const record = invoice({
    invoiceNumber: "INV-23",
    pdfKey: "invoice.pdf",
    inspectionDate: new Date("2026-08-07T12:00:00Z"),
    review: { cycle: 1 },
  });
  let message;

  await emailPropertyManagersForReview(record, [
    { _id: "pm-1", username: "Jordan Lee", email: "jordan@client.example" },
  ], {
    storage: {
      getObject: () => ({ promise: async () => ({ Body: Buffer.from("invoice") }) }),
    },
    OrganizationModel: {
      findById: () => ({
        select: () => ({
          lean: async () => ({
            serviceModel: "managed",
            billingCapabilities: { invoiceApprovalExperience: "authenticated_portal" },
          }),
        }),
      }),
    },
    issueAuthorization: async () => assert.fail("A secure authorization should not be issued"),
    sendEmail: async (options) => { message = options; },
  });

  assert.equal(message.bcc, "jordan@client.example");
  assert.match(message.html, /Review Invoice/);
  assert.match(message.html, /asked to sign in/i);
});
