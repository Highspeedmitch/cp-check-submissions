const test = require("node:test");
const assert = require("node:assert/strict");
const {
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
