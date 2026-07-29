const test = require("node:test");
const assert = require("node:assert/strict");
const Invoice = require("../models/invoice");

test("invoice archival is retained independently from paid status", () => {
  const archivedAt = new Date("2026-07-26T12:00:00Z");
  const invoice = new Invoice({
    organizationId: "507f1f77bcf86cd799439011",
    propertyId: "507f191e810c19729de860ea",
    submissionId: "507f191e810c19729de860eb",
    submitterId: "507f191e810c19729de860ec",
    inspectionDate: new Date("2026-07-25T12:00:00Z"),
    status: "paid",
    archivedAt,
    archivedBy: "507f191e810c19729de860ed",
  });

  assert.equal(invoice.status, "paid");
  assert.equal(invoice.archivedAt, archivedAt);
  assert.equal(invoice.archivedBy.toString(), "507f191e810c19729de860ed");
});

test("new invoices are active by default", () => {
  const invoice = new Invoice();
  assert.equal(invoice.archivedAt, null);
  assert.equal(invoice.archivedBy, null);
});

test("invoice review workflow states and audit fields are retained", () => {
  const reviewerId = "507f191e810c19729de860ed";
  const invoice = new Invoice({
    status: "pending_review",
    review: {
      requestedBy: reviewerId,
      requestedAt: new Date("2026-07-28T12:00:00Z"),
    },
  });
  assert.equal(invoice.validateSync()?.errors?.status, undefined);
  assert.equal(invoice.status, "pending_review");
  assert.equal(invoice.review.requestedBy.toString(), reviewerId);
  assert.equal(invoice.review.decision, "");
});
