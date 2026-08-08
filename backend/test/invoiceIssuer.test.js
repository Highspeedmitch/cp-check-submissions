const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AFTERLIGHT_ISSUER,
  issuerSnapshotForInvoice,
} = require("../services/invoiceIssuer");

test("customer contractor issuer snapshots prefer the admin-configured company name", () => {
  const snapshot = issuerSnapshotForInvoice({
    billingOwner: "customer_submitter",
    fulfillmentSnapshot: {
      source: "customer_contractor",
      invoiceRouting: "customer_accounts_payable",
    },
  }, {
    username: "Jordan Lee",
    email: "jordan@example.com",
    billingProfile: { companyName: "Sonoran Field Services" },
  });

  assert.deepEqual(snapshot, {
    type: "customer_contractor",
    name: "Sonoran Field Services",
    email: "jordan@example.com",
  });
});

test("Afterlight service invoices retain Afterlight as the issuer", () => {
  assert.deepEqual(issuerSnapshotForInvoice({
    billingOwner: "afterlight_platform",
    fulfillmentSnapshot: { invoiceRouting: "afterlight_service_billing" },
  }, {
    username: "Assigned Resource",
    email: "resource@example.com",
  }), AFTERLIGHT_ISSUER);
});
