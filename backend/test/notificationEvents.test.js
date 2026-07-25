const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inspectionSubmitted,
  invoiceSubmitted,
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

test("invoice events confirm submission and describe a later status change", () => {
  const invoice = {
    _id: "invoice-1",
    status: "paid",
    propertySnapshot: { name: "Broadway Center" },
  };
  assert.match(invoiceSubmitted(invoice).body, /submitted successfully/);
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
