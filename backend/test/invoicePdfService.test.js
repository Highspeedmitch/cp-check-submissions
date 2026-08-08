const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateInvoicePDF,
  invoiceHeaderLines,
  INVOICE_VENDOR_NAME,
} = require("../invoicePdfService");

const invoice = {
    invoiceNumber: "TEST-1",
    billingOwner: "afterlight_platform",
    propertySnapshot: {
      name: "Test Property",
      propertyCode: "TP1",
      address: "1 Main Street",
      brokerageName: "PICOR",
    },
    inspectionDate: new Date("2026-02-10T12:00:00Z"),
    amountCents: 7500,
};

test("invoice header presents Afterlight without submitter identity", () => {
  const lines = invoiceHeaderLines(invoice);

  assert.equal(INVOICE_VENDOR_NAME, "Afterlight Inspections");
  assert.ok(lines.includes("From: Afterlight Inspections"));
  assert.equal(lines.some((line) => /contractor|submitter|@/i.test(line)), false);
});

test("generates a valid PDF invoice buffer", async () => {
  const buffer = await generateInvoicePDF(invoice);

  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(buffer.length > 1000);
});

test("customer contractor invoices identify the contractor and Afterlight delivery", () => {
  const lines = invoiceHeaderLines({
    ...invoice,
    billingOwner: "customer_submitter",
    fulfillmentSnapshot: {
      source: "customer_contractor",
      invoiceRouting: "customer_accounts_payable",
    },
    issuerSnapshot: {
      type: "customer_contractor",
      name: "Sonoran Field Services",
      email: "billing@sonoran.example",
    },
  });

  assert.ok(lines.includes("From: Sonoran Field Services"));
  assert.ok(lines.includes("Vendor contact: billing@sonoran.example"));
  assert.ok(lines.includes("Delivered via Afterlight"));
  assert.equal(lines.includes("From: Afterlight Inspections"), false);
});
