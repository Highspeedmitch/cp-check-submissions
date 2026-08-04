const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inspectionSubmitted,
  assignmentCompleted,
  invoiceSubmitted,
  invoiceSubmittedForPropertyManager,
  invoiceReviewChanged,
  invoiceStatusChanged,
  bidRequestSubmitted,
  bidRequestReceived,
  bidRequestStatusChanged,
} = require("../services/notificationEvents");

test("inspection notifications link property managers to the property history", () => {
  const event = inspectionSubmitted("22 & Harrison", "submission-1");
  assert.equal(event.type, "inspection_submitted");
  assert.equal(event.route, "/admin/submissions/22%20%26%20Harrison");
  assert.equal(event.entityId, "submission-1");
});

test("assignment completion notifications identify scheduled work without exposing comments", () => {
  const event = assignmentCompleted("22 & Harrison", "submission-1");
  assert.equal(event.type, "assignment_completed");
  assert.equal(event.title, "Scheduled inspection completed");
  assert.match(event.body, /22 & Harrison/);
  assert.equal(event.route, "/admin/submissions/22%20%26%20Harrison");
  assert.equal(event.entityId, "submission-1");
});

test("invoice events confirm submission and describe a later status change", () => {
  const invoice = {
    _id: "invoice-1",
    status: "paid",
    propertySnapshot: { name: "Broadway Center" },
    delivery: { status: "accepted" },
  };
  assert.match(invoiceSubmitted(invoice).body, /property manager for review/);
  const managerEvent = invoiceSubmittedForPropertyManager(invoice);
  assert.equal(managerEvent.type, "invoice_submitted_for_review");
  assert.equal(managerEvent.route, "/billing/review/invoice-1");
  assert.equal(managerEvent.entityId, "invoice-1");
  assert.match(managerEvent.body, /ready for your review/);
  assert.match(invoiceReviewChanged(invoice, "approved").body, /approved and queued for AP email delivery/);
  assert.match(invoiceReviewChanged(invoice, "declined").body, /declined/);
  assert.match(invoiceStatusChanged(invoice).body, /now paid/);
});

test("initial bid messages distinguish sender confirmation from admin receipt", () => {
  const request = { _id: "bid-1", address: "100 Main Street" };
  assert.match(bidRequestSubmitted(request).body, /sent successfully/);
  assert.match(bidRequestReceived(request).body, /received/);
});

test("bid status push copy remains neutral and does not expose the decision", () => {
  const request = {
    _id: "bid-1",
    address: "100 Main Street",
    status: "declined",
  };
  const event = bidRequestStatusChanged(request);
  assert.equal(event.body, "Your bid for 100 Main Street has a new status.");
  assert.doesNotMatch(event.body, /approved|declined|accepted|denied/i);
});
