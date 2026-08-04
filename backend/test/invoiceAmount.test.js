const test = require("node:test");
const assert = require("node:assert/strict");
const Invoice = require("../models/invoice");

test("invoice suggestions are distinguishable from submitter-entered amounts", () => {
  const suggested = new Invoice({ amountCents: 22500 });
  const submitted = new Invoice({
    amountCents: 22500,
    amountSetBySubmitter: true,
  });

  assert.equal(suggested.amountCents, 22500);
  assert.equal(suggested.amountSetBySubmitter, false);
  assert.equal(submitted.amountSetBySubmitter, true);
});

test("Afterlight service invoices retain platform ownership and preparation audit", () => {
  const preparedAt = new Date("2026-08-02T12:00:00Z");
  const invoice = new Invoice({
    billingOwner: "afterlight_platform",
    platformPreparation: {
      preparedBy: "507f191e810c19729de860ed",
      preparedAt,
    },
  });

  assert.equal(invoice.billingOwner, "afterlight_platform");
  assert.equal(invoice.platformPreparation.preparedBy.toString(), "507f191e810c19729de860ed");
  assert.equal(invoice.platformPreparation.preparedAt, preparedAt);
});
