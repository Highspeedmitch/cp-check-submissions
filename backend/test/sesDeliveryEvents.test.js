const test = require("node:test");
const assert = require("node:assert/strict");
const { applySesDeliveryEvent } = require("../services/sesDeliveryEvents");

const INVOICE_ID = "64f000000000000000000001";

function query(value) {
  const promise = Promise.resolve(value);
  return {
    select() { return promise; },
    then(resolve, reject) { return promise.then(resolve, reject); },
  };
}

function invoice(overrides = {}) {
  return {
    _id: INVOICE_ID,
    organizationId: "64f000000000000000000002",
    propertyId: "64f000000000000000000003",
    submitterId: "64f000000000000000000004",
    billingOwner: "afterlight_platform",
    status: "submitted",
    propertySnapshot: { name: "Black Crown" },
    delivery: {
      provider: "ses",
      providerMessageId: "ses-message-1",
      providerMessageIds: [],
      status: "accepted",
      lastEventAt: null,
      lastEventRank: 0,
      lastEventMessageId: "",
    },
    ...overrides,
  };
}

function modelFor(current, updated = current) {
  const calls = { updates: [] };
  return {
    calls,
    findOne(criteria) {
      if (criteria["delivery.providerMessageId"]) return query(current);
      return query(null);
    },
    findById() { return query(null); },
    async findOneAndUpdate(criteria, update) {
      calls.updates.push({ criteria, update });
      return updated;
    },
  };
}

function sesEvent(type, details = {}) {
  const key = type === "DeliveryDelay" ? "deliveryDelay" : type.toLowerCase();
  return {
    eventType: type,
    mail: {
      messageId: "ses-message-1",
      timestamp: "2026-08-04T15:00:00.000Z",
      tags: { invoice_id: [INVOICE_ID] },
    },
    [key]: { timestamp: "2026-08-04T15:01:00.000Z", ...details },
  };
}

test("marks an accepted AP invoice delivered from an SES delivery event", async () => {
  const record = invoice();
  const updated = invoice({ delivery: { ...record.delivery, status: "delivered" } });
  const InvoiceModel = modelFor(record, updated);

  const result = await applySesDeliveryEvent(sesEvent("Delivery"), {
    snsMessageId: "sns-1",
    InvoiceModel,
    notify: async () => {},
  });

  assert.equal(result.status, "updated");
  assert.equal(result.deliveryStatus, "delivered");
  assert.equal(InvoiceModel.calls.updates[0].update.$set["delivery.status"], "delivered");
  assert.equal(InvoiceModel.calls.updates[0].update.$set["delivery.error"], "");
});

test("marks a bounced AP invoice failed and notifies operations once", async () => {
  const record = invoice();
  const updated = invoice({
    status: "failed",
    delivery: { ...record.delivery, status: "failed" },
  });
  const InvoiceModel = modelFor(record, updated);
  let notifications = 0;

  const result = await applySesDeliveryEvent(sesEvent("Bounce", {
    bounceType: "Permanent",
    bounceSubType: "General",
    bouncedRecipients: [{ diagnosticCode: "smtp; 550 mailbox not found" }],
  }), {
    snsMessageId: "sns-2",
    InvoiceModel,
    notify: async () => { notifications += 1; },
  });

  const update = InvoiceModel.calls.updates[0].update;
  assert.equal(result.deliveryStatus, "failed");
  assert.equal(update.$set.status, "failed");
  assert.equal(update.$set["delivery.errorCode"], "SES_BOUNCE_GENERAL");
  assert.match(update.$set["delivery.error"], /mailbox not found/);
  assert.equal(update.$push.statusHistory.status, "failed");
  assert.equal(notifications, 1);
});

test("records a temporary SES delay without marking the invoice failed", async () => {
  const record = invoice();
  const updated = invoice();
  const InvoiceModel = modelFor(record, updated);
  const result = await applySesDeliveryEvent(sesEvent("DeliveryDelay"), {
    snsMessageId: "sns-3",
    InvoiceModel,
    notify: async () => { throw new Error("should not notify"); },
  });

  const update = InvoiceModel.calls.updates[0].update;
  assert.equal(result.status, "updated");
  assert.equal(update.$set["delivery.status"], "accepted");
  assert.equal(update.$set["delivery.errorCode"], "SES_DELIVERY_DELAY");
  assert.equal(update.$set.status, undefined);
});

test("asks SNS to retry when an event wins the race with the invoice save", async () => {
  const pending = invoice({ status: "approving", delivery: { status: "sending" } });
  const InvoiceModel = {
    findOne() { return query(null); },
    findById() { return query(pending); },
  };

  const result = await applySesDeliveryEvent(sesEvent("Delivery"), {
    snsMessageId: "sns-4",
    InvoiceModel,
  });
  assert.deepEqual(result, {
    status: "retry",
    reason: "invoice_not_ready",
    type: "delivery",
  });
});

test("ignores events from an earlier AP delivery attempt", async () => {
  const InvoiceModel = {
    findOne(criteria) {
      if (criteria["delivery.providerMessageIds"]) return query({ _id: INVOICE_ID });
      return query(null);
    },
  };
  const result = await applySesDeliveryEvent(sesEvent("Bounce"), {
    snsMessageId: "sns-5",
    InvoiceModel,
  });
  assert.equal(result.reason, "old_attempt");
});

test("updates a durable review resend attempt from an SES delivery event", async () => {
  const attempt = {
    _id: "64f000000000000000000010",
    invoiceId: INVOICE_ID,
    organizationId: "64f000000000000000000002",
    status: "accepted",
    recipients: [{
      userId: "64f000000000000000000004",
      providerMessageId: "ses-review-message-1",
      status: "accepted",
      lastEventAt: null,
      lastEventRank: 0,
      lastEventMessageId: "",
    }],
    async save() { this.saved = true; },
  };
  const event = sesEvent("Delivery");
  event.mail.messageId = "ses-review-message-1";
  event.mail.tags = {
    message_type: ["invoice_review"],
    invoice_id: [INVOICE_ID],
    review_attempt_id: [String(attempt._id)],
  };
  const result = await applySesDeliveryEvent(event, {
    snsMessageId: "sns-review-1",
    InvoiceModel: { findOne: () => assert.fail("AP invoice lookup should not run") },
    AttemptModel: {
      findOne: async () => attempt,
      findById: async () => null,
    },
  });

  assert.equal(result.scope, "invoice_review");
  assert.equal(result.deliveryStatus, "delivered");
  assert.equal(attempt.status, "delivered");
  assert.equal(attempt.recipients[0].status, "delivered");
  assert.equal(attempt.saved, true);
});

test("asks SNS to retry when a review event arrives before the attempt is saved", async () => {
  const event = sesEvent("Delivery");
  event.mail.messageId = "ses-review-message-2";
  event.mail.tags = {
    message_type: ["invoice_review"],
    invoice_id: [INVOICE_ID],
    review_attempt_id: ["64f000000000000000000011"],
  };
  const result = await applySesDeliveryEvent(event, {
    snsMessageId: "sns-review-2",
    AttemptModel: {
      findOne: async () => null,
      findById: async () => ({
        status: "sending",
        recipients: [{ providerMessageId: "" }],
      }),
    },
  });
  assert.equal(result.status, "retry");
  assert.equal(result.reason, "review_attempt_not_ready");
});
