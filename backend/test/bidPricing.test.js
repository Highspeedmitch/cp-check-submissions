const test = require("node:test");
const assert = require("node:assert/strict");
const { roundTo25, estimateBidPricing } = require("../services/bidPricing");

test("rounds estimates to the nearest twenty-five dollars", () => {
  assert.equal(roundTo25(212), 200);
  assert.equal(roundTo25(213), 225);
});

test("estimates a monthly free-standing property", () => {
  const estimate = estimateBidPricing({
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
  });
  assert.equal(estimate.estimatedPerVisitCents, 22500);
  assert.equal(estimate.estimatedMonthlyCents, 22500);
  assert.equal(estimate.requiresManualReview, false);
});

test("applies property complexity and weekly frequency", () => {
  const estimate = estimateBidPricing({
    grossSquareFeet: 18000,
    propertyType: "strip_mall",
    serviceFrequency: "weekly",
  });
  assert.equal(estimate.estimatedPerVisitCents, 25000);
  assert.equal(estimate.estimatedMonthlyCents, 90000);
  assert.equal(estimate.inputs.complexityModifier, 1.15);
});

test("ad-hoc work has no monthly estimate and requires review", () => {
  const estimate = estimateBidPricing({
    grossSquareFeet: 10000,
    propertyType: "individual_suite",
    serviceFrequency: "ad_hoc",
  });
  assert.equal(estimate.estimatedMonthlyCents, null);
  assert.equal(estimate.requiresManualReview, true);
  assert.deepEqual(estimate.manualReviewReasons, ["ad_hoc_frequency"]);
});

test("the final per-visit estimate never falls below the minimum", () => {
  const estimate = estimateBidPricing({
    grossSquareFeet: 1500,
    propertyType: "individual_suite",
    serviceFrequency: "monthly",
  });
  assert.equal(estimate.estimatedPerVisitCents, 15000);
});

test("known issues flag the baseline estimate for manual review", () => {
  const estimate = estimateBidPricing({
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
    hasKnownIssues: true,
  });
  assert.equal(estimate.estimatedMonthlyCents, 22500);
  assert.deepEqual(estimate.manualReviewReasons, ["known_issues"]);
});

test("rejects invalid pricing inputs", () => {
  assert.throws(() => estimateBidPricing({
    grossSquareFeet: "not-a-number",
    propertyType: "free_standing",
    serviceFrequency: "monthly",
  }), /positive number/);
});
