const test = require("node:test");
const assert = require("node:assert/strict");
const { sendApprovedInvoiceToAp } = require("../services/apDelivery");

function invoice(overrides = {}) {
  return {
    _id: "invoice-1",
    invoiceNumber: "INV-10",
    pdfKey: "invoice.pdf",
    amountCents: 15000,
    inspectionDate: new Date("2026-08-04T12:00:00Z"),
    propertySnapshot: {
      name: "Black Crown",
      propertyCode: "BLK01",
      apMethod: "email",
      apEmail: "ap@example.com",
    },
    delivery: {},
    ...overrides,
  };
}

test("records SES acceptance without claiming final mailbox delivery", async () => {
  const record = invoice();
  const result = await sendApprovedInvoiceToAp(record, "", {
    storage: {
      getObject: () => ({ promise: async () => ({ Body: Buffer.from("invoice") }) }),
    },
    sendEmail: async () => ({ accepted: true, provider: "ses", messageId: "ses-message-id" }),
    now: () => new Date("2026-08-04T15:00:00Z"),
  });

  assert.equal(result.status, "accepted");
  assert.match(result.warning, /queued.*not yet confirmed/i);
  assert.equal(record.delivery.status, "accepted");
  assert.equal(record.delivery.provider, "ses");
  assert.equal(record.delivery.providerMessageId, "ses-message-id");
  assert.equal(record.delivery.attemptCount, 1);
  assert.equal(record.delivery.deliveredAt, undefined);
});

test("retains attempt metadata when the provider rejects the message", async () => {
  const record = invoice();

  await assert.rejects(
    sendApprovedInvoiceToAp(record, "", {
      storage: {
        getObject: () => ({ promise: async () => ({ Body: Buffer.from("invoice") }) }),
      },
      sendEmail: async () => ({ accepted: false, provider: "ses" }),
      now: () => new Date("2026-08-04T15:00:00Z"),
    }),
    /did not accept/
  );
  assert.equal(record.delivery.status, "sending");
  assert.equal(record.delivery.destination, "ap@example.com");
  assert.equal(record.delivery.attemptCount, 1);
});

test("rejects a malformed AP address before calling SES", async () => {
  const record = invoice({
    propertySnapshot: {
      name: "Black Crown",
      propertyCode: "BLK01",
      apMethod: "email",
      apEmail: "not-an-email",
    },
  });
  let emailCalled = false;

  await assert.rejects(
    sendApprovedInvoiceToAp(record, "", {
      storage: {
        getObject: () => ({ promise: async () => ({ Body: Buffer.from("invoice") }) }),
      },
      sendEmail: async () => { emailCalled = true; },
    }),
    /valid AP email address/
  );
  assert.equal(emailCalled, false);
  assert.equal(record.delivery.attemptCount, 1);
});
