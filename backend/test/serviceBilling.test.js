const test = require("node:test");
const assert = require("node:assert/strict");
const {
  billingOwnerForFulfillment,
  customerChargeSnapshotForAssignment,
  isAfterlightServiceInvoice,
  afterlightServiceInvoiceScope,
} = require("../services/serviceBilling");

test("Afterlight assignment charges snapshot the configured property rate", () => {
  const snapshottedAt = new Date("2026-08-09T12:00:00.000Z");
  assert.deepEqual(customerChargeSnapshotForAssignment({
    fulfillment: { invoiceRouting: "afterlight_service_billing" },
    property: { defaultInspectionAmountCents: 18500 },
    snapshottedAt,
  }), {
    billingOwner: "afterlight_platform",
    rateType: "per_assignment",
    amountCents: 18500,
    currency: "USD",
    source: "property_default",
    snapshottedAt,
  });
  assert.equal(customerChargeSnapshotForAssignment({
    fulfillment: { invoiceRouting: "none" },
    property: { defaultInspectionAmountCents: 18500 },
  }), null);
});

test("missing Afterlight property rates are snapshotted as missing instead of silently changing later", () => {
  const snapshot = customerChargeSnapshotForAssignment({
    fulfillment: { invoiceRouting: "afterlight_service_billing" },
    property: {},
  });
  assert.equal(snapshot.amountCents, null);
  assert.ok(snapshot.snapshottedAt instanceof Date);
});

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
