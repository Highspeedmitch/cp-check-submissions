const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureContractorEarning } = require("../services/contractorEarnings");

test("approved completion starts as an independent pending contractor earning", async () => {
  let query;
  let update;
  let options;
  const earning = { _id: "earning-1", status: "pending_approval" };
  const result = await ensureContractorEarning({
    assignment: {
      _id: "assignment-1",
      resourceProfileId: "resource-1",
      userId: "resource-user-1",
      organizationId: "org-1",
      fulfillment: { source: "afterlight_contractor" },
      compensationSnapshot: {
        payeeType: "afterlight_contractor",
        rateType: "per_assignment",
        amountCents: 6250,
        currency: "USD",
        snapshottedAt: new Date("2026-08-01T12:00:00.000Z"),
      },
    },
    submission: {
      _id: "submission-1",
      submittedAt: new Date("2026-08-02T12:00:00.000Z"),
    },
    property: { _id: "property-1" },
    EarningModel: {
      async findOneAndUpdate(receivedQuery, receivedUpdate, receivedOptions) {
        query = receivedQuery;
        update = receivedUpdate;
        options = receivedOptions;
        return earning;
      },
    },
  });

  assert.equal(result, earning);
  assert.deepEqual(query, { assignmentId: "assignment-1" });
  assert.equal(update.$setOnInsert.submissionId, "submission-1");
  assert.equal(update.$setOnInsert.grossAmountCents, 6250);
  assert.equal(update.$setOnInsert.status, "pending_approval");
  assert.deepEqual(options, { new: true, upsert: true, setDefaultsOnInsert: true });
});

test("customer workers never create contractor payables", async () => {
  const result = await ensureContractorEarning({
    assignment: { fulfillment: { source: "customer_employee" } },
    submission: {},
    property: {},
    EarningModel: { findOneAndUpdate: () => assert.fail("earning should not be written") },
  });
  assert.equal(result, null);
});

test("contractor earnings reject assignments without a valid immutable rate", async () => {
  await assert.rejects(ensureContractorEarning({
    assignment: {
      fulfillment: { source: "afterlight_contractor" },
      resourceProfileId: "resource-1",
      compensationSnapshot: { amountCents: 0 },
    },
    submission: {},
    property: {},
  }), /missing its compensation snapshot/);
});
