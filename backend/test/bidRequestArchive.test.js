const test = require("node:test");
const assert = require("node:assert/strict");
const BidRequest = require("../models/bidRequest");

test("bid archival is stored independently from review status", () => {
  const bid = new BidRequest({
    organizationId: "507f1f77bcf86cd799439011",
    requestedBy: "507f191e810c19729de860ea",
    grossSquareFeet: 10000,
    propertyType: "strip_mall",
    address: "1 Main Street",
    serviceFrequency: "monthly",
    attachmentKey: "bid/test.pdf",
    attachmentName: "test.pdf",
    status: "approved",
    archivedAt: new Date("2026-07-24T12:00:00Z"),
  });

  assert.equal(bid.status, "approved");
  assert.ok(bid.archivedAt instanceof Date);
});

test("pricing estimates are excluded from bid queries unless explicitly selected", () => {
  assert.equal(BidRequest.schema.path("pricingEstimate").options.select, false);
});
