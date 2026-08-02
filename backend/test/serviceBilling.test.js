const test = require("node:test");
const assert = require("node:assert/strict");
const {
  billingOwnerForFulfillment,
  isAfterlightServiceInvoice,
  afterlightServiceInvoiceScope,
} = require("../services/serviceBilling");

test("Afterlight fulfillment is owned by platform billing", () => {
  assert.equal(billingOwnerForFulfillment({ invoiceRouting: "afterlight_service_billing" }), "afterlight_platform");
  assert.equal(billingOwnerForFulfillment({ invoiceRouting: "customer_accounts_payable" }), "customer_submitter");
  assert.equal(billingOwnerForFulfillment({ invoiceRouting: "none" }), "customer_submitter");
});

test("service invoice recognition supports existing routing snapshots", () => {
  assert.equal(isAfterlightServiceInvoice({ billingOwner: "afterlight_platform" }), true);
  assert.equal(isAfterlightServiceInvoice({
    fulfillmentSnapshot: { invoiceRouting: "afterlight_service_billing" },
  }), true);
  assert.equal(isAfterlightServiceInvoice({
    billingOwner: "customer_submitter",
    fulfillmentSnapshot: { invoiceRouting: "customer_accounts_payable" },
  }), false);
});

test("platform service invoice scope retains action constraints and legacy matching", () => {
  const scope = afterlightServiceInvoiceScope({ _id: "invoice-1", status: "unbilled" });
  assert.equal(scope._id, "invoice-1");
  assert.equal(scope.status, "unbilled");
  assert.deepEqual(scope.$or, [
    { billingOwner: "afterlight_platform" },
    { "fulfillmentSnapshot.invoiceRouting": "afterlight_service_billing" },
  ]);
});
