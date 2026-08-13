const test = require("node:test");
const assert = require("node:assert/strict");
const billingRouter = require("../Routes/billing");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("approval route accepts a POST without a request body", async () => {
  let approvalInput;
  const messages = [];
  const handler = billingRouter.createApproveInvoiceHandler({
    approveInvoice: async (input) => {
      approvalInput = input;
      return {
        invoice: {
          _id: "6a7bf386e6f9496f319a015c",
          organizationId: "679e32582f89d2e93719159d",
          delivery: {
            method: "email",
            status: "accepted",
            provider: "ses",
            providerMessageId: "message-1",
            attemptCount: 1,
          },
          toObject() {
            return { _id: this._id, status: "submitted", delivery: this.delivery };
          },
        },
        deliveryResult: { status: "accepted", warning: "Queued for AP delivery." },
      };
    },
    logger: {
      info: (message) => messages.push(JSON.parse(message)),
      error: () => assert.fail("approval should not be rejected"),
    },
  });
  const res = response();

  await handler({
    params: { id: "6a7bf386e6f9496f319a015c" },
    user: {
      userId: "6a76605315173ac90d150d65",
      organizationId: "679e32582f89d2e93719159d",
      role: "property_manager",
    },
  }, res);

  assert.equal(approvalInput.confirmationNumber, "");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "submitted");
  assert.equal(messages[0].event, "invoice_ap_delivery_accepted");
});

test("unexpected approval errors retain safe diagnostics in application logs", async () => {
  const messages = [];
  const handler = billingRouter.createApproveInvoiceHandler({
    approveInvoice: async () => {
      throw new TypeError("Cannot read approval input.");
    },
    logger: {
      info: () => assert.fail("approval should not be accepted"),
      error: (message) => messages.push(JSON.parse(message)),
    },
  });
  const res = response();

  await handler({
    params: { id: "6a7bf386e6f9496f319a015c" },
    user: { organizationId: "679e32582f89d2e93719159d" },
    body: {},
  }, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, "Unable to approve and send this invoice.");
  assert.deepEqual(messages[0], {
    event: "invoice_approval_rejected",
    invoiceId: "6a7bf386e6f9496f319a015c",
    organizationId: "679e32582f89d2e93719159d",
    errorCode: "INVOICE_APPROVAL_ERROR",
    errorName: "TypeError",
    errorMessage: "Cannot read approval input.",
  });
});
