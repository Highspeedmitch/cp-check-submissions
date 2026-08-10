const test = require("node:test");
const assert = require("node:assert/strict");
const {
  roundTo25,
  estimateBidPricing,
  estimateClusterPricing,
  estimateRouteAwarePricing,
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
  assert.equal(estimate.estimatedPerVisitCents, 10000);
  assert.equal(estimate.estimatedMonthlyCents, 10000);
  assert.equal(estimate.requiresManualReview, false);
});

test("matches the supplied retail-center size benchmarks", () => {
  [
    [18000, 12500],
    [40000, 20000],
    [78000, 25000],
  ].forEach(([grossSquareFeet, expectedCents]) => {
    const estimate = estimateBidPricing({
      grossSquareFeet,
      propertyType: "strip_mall",
      serviceFrequency: "monthly",
    });
    assert.equal(estimate.estimatedPerVisitCents, expectedCents);
    assert.equal(estimate.inputs.sizeBenchmarkPerVisitCents, expectedCents);
    assert.equal(estimate.inputs.benchmarkPropertyType, "strip_mall");
  });
});

test("applies property complexity and weekly frequency", () => {
  const estimate = estimateBidPricing({
    grossSquareFeet: 18000,
    propertyType: "strip_mall",
    serviceFrequency: "weekly",
  });
  assert.equal(estimate.estimatedPerVisitCents, 12500);
  assert.equal(estimate.estimatedMonthlyCents, 45000);
  assert.equal(estimate.inputs.complexityModifier, 1);
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
  assert.equal(estimate.estimatedPerVisitCents, 5000);
  assert.equal(estimate.inputs.minimumPerVisitCents, 5000);
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
    includeManagedServiceFee: true,
  });
  assert.equal(estimate.version, 6);
  assert.equal(estimate.pricingMode, "cluster");
  assert.equal(estimate.standalonePerVisitCents, 15000);
  assert.equal(estimate.estimatedPerVisitCents, 10000);
  assert.equal(estimate.estimatedMonthlyCents, 10000);
  assert.equal(estimate.clusterDiscountPerVisitCents, 5000);
  assert.deepEqual(estimate.managedService, {
    baseMonthlyFeeCents: 50000,
    includedInContractTotal: true,
    estimatedContractMonthlyCents: 60000,
  });
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
    [5000, 12500, 10000]
  );
  assert.equal(estimate.estimatedPerVisitCents, 20000);
  assert.equal(estimate.standalonePerVisitCents, 27500);
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

test("cluster pricing shares the six-property operational route limit", () => {
  const properties = Array.from({ length: 7 }, () => ({
    grossSquareFeet: 1500,
    propertyType: "free_standing",
  }));
  assert.throws(() => estimateClusterPricing({
    properties,
    serviceFrequency: "monthly",
    withinHalfMile: true,
    sameScheduledVisit: true,
  }), /more than 6 properties/);
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
  assert.equal(estimate.estimatedMonthlyCents, 10000);
  assert.deepEqual(estimate.manualReviewReasons, ["known_issues"]);
});

test("rejects invalid pricing inputs", () => {
  assert.throws(() => estimateBidPricing({
    grossSquareFeet: "not-a-number",
    propertyType: "free_standing",
    serviceFrequency: "monthly",
  }), /positive number/);
});

test("route-aware pricing adds only travel beyond the included local trip", () => {
  const estimate = estimateRouteAwarePricing({
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
    travelContext: {
      method: "road_matrix",
      home: { roundTripMiles: 20, roundTripMinutes: 60 },
      portfolio: { densityScore: 0 },
      route: { confidence: 0, additionalMiles: 20, additionalMinutes: 60 },
    },
  });
  assert.equal(estimate.version, 6);
  assert.equal(estimate.pricingMode, "route_aware");
  assert.equal(estimate.basePerVisitCents, 10000);
  assert.equal(estimate.travelSurchargeCents, 2200);
  assert.equal(estimate.estimatedPerVisitCents, 12000);
  assert.equal(estimate.requiresManualReview, false);
});

test("confirmed route fit and portfolio density reduce marginal travel cost", () => {
  const estimate = estimateRouteAwarePricing({
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
    travelContext: {
      method: "road_matrix",
      home: { roundTripMiles: 20, roundTripMinutes: 60 },
      portfolio: { densityScore: 0.8, propertyCount: 4 },
      route: { confidence: 1, additionalMiles: 1, additionalMinutes: 3 },
    },
  });
  assert.equal(estimate.travelSurchargeCents, 2200);
  assert.equal(estimate.routeCreditCents, 6720);
  assert.equal(estimate.portfolioCreditCents, 480);
  assert.equal(estimate.combinedCreditCents, 7200);
  assert.equal(estimate.estimatedPerVisitCents, 5000);
  assert.equal(estimate.geography.route.fitScore, 0.96);
  assert.equal(estimate.geography.route.pricingBand, "direct_route");
});

test("a direct modeled insertion reaches the marginal market-price band", () => {
  const estimate = estimateRouteAwarePricing({
    grossSquareFeet: 50000,
    propertyType: "strip_mall",
    serviceFrequency: "monthly",
    travelContext: {
      method: "road_matrix",
      home: { roundTripMiles: 12, roundTripMinutes: 34.75 },
      portfolio: { densityScore: 0.65, propertyCount: 9 },
      route: {
        commitment: "modeled",
        confidence: 0.6,
        additionalMiles: 0.2,
        additionalMinutes: 2,
      },
    },
  });
  assert.equal(estimate.basePerVisitCents, 22500);
  assert.equal(estimate.estimatedPerVisitCents, 7000);
  assert.equal(estimate.routeCreditCents, 14084);
  assert.equal(estimate.portfolioCreditCents, 1625);
  assert.equal(estimate.geography.route.fitScore, 0.9936);
  assert.equal(estimate.geography.route.commitmentFactor, 0.9);
  assert.equal(estimate.geography.route.pricingBand, "direct_route");
});

test("portfolio density retains marginal utility without a route commitment", () => {
  const estimate = estimateRouteAwarePricing({
    grossSquareFeet: 50000,
    propertyType: "strip_mall",
    serviceFrequency: "monthly",
    travelContext: {
      method: "road_matrix",
      home: { roundTripMiles: 12, roundTripMinutes: 34.75 },
      portfolio: { densityScore: 1, propertyCount: 9 },
      route: {
        commitment: "none",
        confidence: 0,
        additionalMiles: 12,
        additionalMinutes: 34.75,
      },
    },
  });
  assert.equal(estimate.routeCreditCents, 0);
  assert.equal(estimate.portfolioCreditCents, 2500);
  assert.equal(estimate.estimatedPerVisitCents, 20500);
  assert.equal(estimate.geography.route.pricingBand, "standard_route");
});

test("route and density credits remain bounded and cannot break the fifty-dollar floor", () => {
  const estimate = estimateRouteAwarePricing({
    grossSquareFeet: 1500,
    propertyType: "individual_suite",
    serviceFrequency: "monthly",
    travelContext: {
      method: "road_matrix",
      home: { roundTripMiles: 1, roundTripMinutes: 3 },
      portfolio: { densityScore: 1, propertyCount: 10 },
      route: { confidence: 1, additionalMiles: 0, additionalMinutes: 0 },
    },
  });
  assert.equal(estimate.basePerVisitCents, 5000);
  assert.equal(estimate.combinedCreditCents, 0);
  assert.equal(estimate.estimatedPerVisitCents, 5000);
});

test("modeled coordinate routing is transparent and requires manual review", () => {
  const estimate = estimateRouteAwarePricing({
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "weekly",
    travelContext: {
      method: "modeled_coordinates",
      home: { roundTripMiles: 8, roundTripMinutes: 20 },
      portfolio: { densityScore: 0.5, propertyCount: 2 },
      route: { confidence: 0.6, additionalMiles: 1, additionalMinutes: 3 },
    },
  });
  assert.equal(estimate.estimatedPerVisitCents, 9000);
  assert.equal(estimate.estimatedMonthlyCents, 32500);
  assert.equal(estimate.geography.route.fitScore, 0);
  assert.equal(estimate.geography.route.pricingBand, "standard_route");
  assert.deepEqual(estimate.manualReviewReasons, ["modeled_route_data"]);
});

test("adds the managed-service base once without changing the visit estimate", () => {
  const estimate = estimateBidPricing({
    grossSquareFeet: 40000,
    propertyType: "strip_mall",
    serviceFrequency: "monthly",
    includeManagedServiceFee: true,
  });
  assert.equal(estimate.estimatedPerVisitCents, 20000);
  assert.equal(estimate.estimatedMonthlyCents, 20000);
  assert.deepEqual(estimate.managedService, {
    baseMonthlyFeeCents: 50000,
    includedInContractTotal: true,
    estimatedContractMonthlyCents: 70000,
  });
});

test("provider fallback is distinguished from an intentionally modeled route", () => {
  const estimate = estimateRouteAwarePricing({
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
    travelContext: {
      method: "modeled_coordinates",
      providerFallback: { code: "PRICING_ROUTING_TIMEOUT" },
      home: { roundTripMiles: 8, roundTripMinutes: 20 },
      portfolio: { densityScore: 0 },
      route: { confidence: 0, additionalMiles: 8, additionalMinutes: 20 },
    },
  });
  assert.deepEqual(estimate.manualReviewReasons, ["routing_provider_fallback"]);
});

test("route-aware pricing rejects missing and malformed travel metrics", () => {
  assert.throws(() => estimateRouteAwarePricing({
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
  }), /travel context/);
  assert.throws(() => estimateRouteAwarePricing({
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
    travelContext: { home: { roundTripMiles: -1, roundTripMinutes: 20 } },
  }), /non-negative/);
});
