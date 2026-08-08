const test = require("node:test");
const assert = require("node:assert/strict");
const {
  roundTo25,
  estimateBidPricing,
  estimateClusterPricing,
} = require("../services/bidPricing");

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
  assert.equal(estimate.estimatedPerVisitCents, 7500);
});

test("clusters retain the primary property and discount each additional property by half", () => {
  const estimate = estimateClusterPricing({
    properties: [
      { grossSquareFeet: 1500, propertyType: "free_standing" },
      { grossSquareFeet: 1500, propertyType: "free_standing" },
      { grossSquareFeet: 1500, propertyType: "free_standing" },
    ],
    serviceFrequency: "monthly",
    withinHalfMile: true,
    sameScheduledVisit: true,
  });
  assert.equal(estimate.version, 2);
  assert.equal(estimate.pricingMode, "cluster");
  assert.equal(estimate.standalonePerVisitCents, 22500);
  assert.equal(estimate.estimatedPerVisitCents, 15000);
  assert.equal(estimate.estimatedMonthlyCents, 15000);
  assert.equal(estimate.clusterDiscountPerVisitCents, 7500);
  assert.equal(estimate.inputs.primaryPropertyIndex, 0);
  assert.equal(estimate.inputs.additionalPropertyMultiplier, 0.5);
});

test("clusters use the most expensive property as the undiscounted primary", () => {
  const estimate = estimateClusterPricing({
    properties: [
      { grossSquareFeet: 1500, propertyType: "free_standing" },
      { grossSquareFeet: 18000, propertyType: "strip_mall" },
      { grossSquareFeet: 18000, propertyType: "free_standing" },
    ],
    serviceFrequency: "monthly",
    withinHalfMile: true,
    sameScheduledVisit: true,
  });
  assert.equal(estimate.inputs.primaryPropertyIndex, 1);
  assert.deepEqual(
    estimate.properties.map((property) => property.standalonePerVisitCents),
    [7500, 25000, 22500]
  );
  assert.equal(estimate.estimatedPerVisitCents, 40000);
  assert.equal(estimate.standalonePerVisitCents, 55000);
});

test("cluster pricing requires explicit proximity and same-visit eligibility", () => {
  const properties = [
    { grossSquareFeet: 1500, propertyType: "free_standing" },
    { grossSquareFeet: 1500, propertyType: "free_standing" },
  ];
  assert.throws(() => estimateClusterPricing({
    properties,
    serviceFrequency: "monthly",
    sameScheduledVisit: true,
  }), /within 0.5 mile/);
  assert.throws(() => estimateClusterPricing({
    properties,
    serviceFrequency: "monthly",
    withinHalfMile: true,
  }), /same scheduled visit/);
});

test("cluster pricing rejects malformed property entries", () => {
  assert.throws(() => estimateClusterPricing({
    properties: [null, { grossSquareFeet: 1500, propertyType: "free_standing" }],
    serviceFrequency: "monthly",
    withinHalfMile: true,
    sameScheduledVisit: true,
  }), /Cluster property 1 is invalid/);
});

test("ad-hoc clusters require review and omit monthly comparisons", () => {
  const estimate = estimateClusterPricing({
    properties: [
      { grossSquareFeet: 1500, propertyType: "free_standing" },
      { grossSquareFeet: 1500, propertyType: "free_standing" },
    ],
    serviceFrequency: "ad_hoc",
    withinHalfMile: true,
    sameScheduledVisit: true,
  });
  assert.equal(estimate.estimatedMonthlyCents, null);
  assert.equal(estimate.standaloneMonthlyCents, null);
  assert.equal(estimate.clusterDiscountMonthlyCents, null);
  assert.deepEqual(estimate.manualReviewReasons, ["ad_hoc_frequency"]);
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
