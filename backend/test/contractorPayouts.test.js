const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPayoutLines, newBatchNumber } = require("../services/contractorPayouts");

test("Gusto payout lines group approved earnings by contractor", () => {
  const resource = {
    _id: "resource-1",
    displayName: "Riley Resource",
    gusto: { contractorUuid: "gusto-contractor-1" },
  };
  const lines = buildPayoutLines([
    { _id: "earning-1", resourceProfileId: resource, grossAmountCents: 5000, reimbursementCents: 1000 },
    { _id: "earning-2", resourceProfileId: resource, grossAmountCents: 6250, reimbursementCents: 0 },
  ]);

  assert.deepEqual(lines, [{
    resourceProfileId: "resource-1",
    gustoContractorUuid: "gusto-contractor-1",
    earningIds: ["earning-1", "earning-2"],
    grossAmountCents: 11250,
    reimbursementCents: 1000,
    totalAmountCents: 12250,
  }]);
});

test("payout preparation refuses a contractor who is not linked to Gusto", () => {
  assert.throws(() => buildPayoutLines([{
    _id: "earning-1",
    resourceProfileId: { _id: "resource-1", displayName: "Riley Resource", gusto: {} },
    grossAmountCents: 5000,
  }]), (error) => error.status === 400 && /not linked to Gusto/.test(error.message));
});

test("Gusto batch numbers are date-stamped and externally recognizable", () => {
  assert.equal(
    newBatchNumber(new Date("2026-08-02T12:00:00.000Z"), "ABC123"),
    "GUSTO-20260802-ABC123"
  );
});
