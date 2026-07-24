const test = require("node:test");
const assert = require("node:assert/strict");
const { generateInvoicePDF } = require("../invoicePdfService");

test("generates a valid PDF invoice buffer", async () => {
  const buffer = await generateInvoicePDF({
    invoiceNumber: "TEST-1",
    propertySnapshot: {
      name: "Test Property",
      propertyCode: "TP1",
      address: "1 Main Street",
      brokerageName: "PICOR",
    },
    inspectionDate: new Date("2026-02-10T12:00:00Z"),
    amountCents: 7500,
  }, {
    username: "Test Contractor",
    email: "contractor@example.com",
  });

  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(buffer.length > 1000);
});
