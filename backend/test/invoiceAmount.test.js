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
