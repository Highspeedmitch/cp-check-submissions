const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateInvoicePDF,
  invoiceHeaderLines,
  INVOICE_VENDOR_NAME,
} = require("../invoicePdfService");

const invoice = {
    invoiceNumber: "TEST-1",
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
