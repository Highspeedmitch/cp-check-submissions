const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BOUTIQUE_TRAVEL_POLICY,
  allocateCentsByWeights,
  estimateBoutiquePricing,
  normalizeBoutiqueProperties,
  normalizeBoutiqueServiceFrequency,
  resolveBoutiqueTravelContext,
  routeContextFromMatrix,
  tripTravelChargeCents,
} = require("../services/boutiquePricing");

const METERS_PER_MILE = 1609.344;

function property(index, overrides = {}) {
  return {
    grossSquareFeet: 1500,
    propertyType: "free_standing",
    candidate: {
      id: `property-${index}`,
      name: `Property ${index}`,
      lat: 32.2 + (index / 100),
      lng: -110.9 - (index / 100),
    },
    ...overrides,
  };
}

function normalized(count = 1) {
  return normalizeBoutiqueProperties(
    Array.from({ length: count }, (_, index) => property(index + 1))
  );
}

test("Boutique pricing accepts one to three properties and rejects every eligibility boundary", () => {
  assert.equal(normalized(1).length, 1);
  assert.equal(normalized(3).length, 3);
  assert.throws(() => normalizeBoutiqueProperties([]), /between 1 and 3 properties/i);
  assert.throws(
    () => normalizeBoutiqueProperties([property(1), property(2), property(3), property(4)]),
    /between 1 and 3 properties/i
  );
  assert.throws(
    () => normalizeBoutiqueProperties([property(1, { grossSquareFeet: 5000 })]),
    (error) => error.code === "BOUTIQUE_PROPERTY_SIZE_EXCEEDED"
  );
  assert.throws(
    () => normalizeBoutiqueProperties([property(1, { grossSquareFeet: null })]),
    (error) => error.code === "BOUTIQUE_PROPERTY_SIZE_REQUIRED"
  );
  assert.throws(
    () => normalizeBoutiqueProperties([property(1, { candidate: null })]),
    /Boutique property 1/i
  );
});

test("Boutique pricing is monthly-only and rejects a crafted alternate frequency", () => {
  assert.equal(normalizeBoutiqueServiceFrequency(), "monthly");
  assert.equal(normalizeBoutiqueServiceFrequency("MONTHLY"), "monthly");
  assert.throws(
    () => normalizeBoutiqueServiceFrequency("weekly"),
    (error) => error.status === 400 && error.code === "BOUTIQUE_MONTHLY_SERVICE_REQUIRED"
  );
  assert.throws(() => estimateBoutiquePricing({
    properties: normalized(1),
    serviceFrequency: "ad_hoc",
    travelContext: {
      method: "road_matrix",
      sameScheduledVisit: true,
      trips: [{ roundTripMiles: 10, roundTripMinutes: 30 }],
    },
  }), /only for monthly visits/i);
});

test("travel allocation is deterministic and reconciles every cent", () => {
  assert.deepEqual(allocateCentsByWeights(5, [1, 1, 1]), [2, 2, 1]);
  assert.deepEqual(allocateCentsByWeights(100, [1, 3]), [25, 75]);
  assert.deepEqual(allocateCentsByWeights(7, [0, 0]), [4, 3]);
  assert.equal(allocateCentsByWeights(5, [1, 1, 1]).reduce((sum, value) => sum + value, 0), 5);
});

test("Boutique travel charges use excess miles and time without a percentage cap", () => {
  assert.deepEqual(BOUTIQUE_TRAVEL_POLICY, {
    includedRoundTripMiles: 10,
    includedRoundTripMinutes: 30,
    vehicleCostCentsPerMile: 76,
    travelLaborCentsPerHour: 3000,
    manualReviewRoundTripMiles: 60,
    manualReviewRoundTripMinutes: 90,
    finalRoundingCents: 500,
  });
  assert.equal(tripTravelChargeCents({ roundTripMiles: 10, roundTripMinutes: 30 }), 0);
  assert.equal(tripTravelChargeCents({ roundTripMiles: 30, roundTripMinutes: 60 }), 3020);

  const estimate = estimateBoutiquePricing({
    properties: normalized(1),
    travelContext: {
      method: "road_matrix",
      sameScheduledVisit: true,
      trips: [{ roundTripMiles: 100, roundTripMinutes: 150, stopNames: ["Property 1"] }],
    },
  });
  assert.equal(estimate.properties[0].baseVisitCents, 5000);
  assert.equal(estimate.travelAdjustmentCents, 13000);
  assert.ok(estimate.travelAdjustmentCents > estimate.properties[0].baseVisitCents * 0.35);
  assert.deepEqual(estimate.manualReviewReasons, ["travel_distance"]);
});

test("the $75 Boutique license is applied once and never discounts property visit floors", () => {
  const oneProperty = estimateBoutiquePricing({
    properties: normalized(1),
    travelContext: {
      method: "road_matrix",
      provider: "mapbox",
      sameScheduledVisit: true,
      trips: [{ roundTripMiles: 10, roundTripMinutes: 30, stopNames: ["Property 1"] }],
    },
  });
  assert.equal(oneProperty.version, "boutique-1");
  assert.equal(oneProperty.pricingMode, "boutique");
  assert.equal(oneProperty.baseVisitTotalCents, 5000);
  assert.equal(oneProperty.travelAdjustmentCents, 0);
  assert.equal(oneProperty.estimatedMonthlyCents, 5000);
  assert.equal(oneProperty.boutiqueService.baseMonthlyFeeCents, 7500);
  assert.equal(oneProperty.boutiqueService.estimatedContractMonthlyCents, 12500);

  const threeProperties = estimateBoutiquePricing({
    properties: normalized(3),
    travelContext: {
      method: "road_matrix",
      sameScheduledVisit: true,
      trips: [{
        roundTripMiles: 10,
        roundTripMinutes: 30,
        stopNames: ["Property 1", "Property 2", "Property 3"],
      }],
    },
  });
  assert.equal(threeProperties.baseVisitTotalCents, 15000);
  assert.equal(threeProperties.boutiqueService.baseMonthlyFeeCents, 7500);
  assert.equal(threeProperties.boutiqueService.estimatedContractMonthlyCents, 22500);
  assert.equal(threeProperties.inputs.propertyCount, 3);
  assert.equal(threeProperties.inputs.maximumPropertySquareFeetExclusive, 5000);
  assert.equal(threeProperties.inputs.serviceFrequency, "monthly");
});

test("same-date Boutique routing optimizes one loop while separate service retains one trip per property", () => {
  const properties = normalized(2);
  const matrix = {
    provider: "mapbox",
    distancesMeters: [
      [0, 15 * METERS_PER_MILE, 15 * METERS_PER_MILE],
      [15 * METERS_PER_MILE, 0, 2 * METERS_PER_MILE],
      [15 * METERS_PER_MILE, 2 * METERS_PER_MILE, 0],
    ],
    durationsSeconds: [
      [0, 30 * 60, 30 * 60],
      [30 * 60, 0, 4 * 60],
      [30 * 60, 4 * 60, 0],
    ],
  };
  const homeBase = { name: "Operations base" };
  const shared = routeContextFromMatrix({ homeBase, properties, matrix, sameScheduledVisit: true });
  const separate = routeContextFromMatrix({ homeBase, properties, matrix, sameScheduledVisit: false });

  assert.equal(shared.trips.length, 1);
  assert.equal(shared.trips[0].roundTripMiles, 32);
  assert.equal(shared.trips[0].roundTripMinutes, 64);
  assert.deepEqual(new Set(shared.trips[0].stopNames), new Set(["Property 1", "Property 2"]));
  assert.equal(separate.trips.length, 2);
  assert.deepEqual(separate.trips.map((trip) => trip.roundTripMiles), [30, 30]);

  const sharedEstimate = estimateBoutiquePricing({ properties, travelContext: shared });
  const separateEstimate = estimateBoutiquePricing({ properties, travelContext: separate });
  assert.equal(sharedEstimate.travelAdjustmentCents, 3500);
  assert.equal(separateEstimate.travelAdjustmentCents, 6000);
  assert.deepEqual(
    sharedEstimate.properties.map((propertyEstimate) => propertyEstimate.travelAdjustmentCents),
    [1750, 1750]
  );
  assert.deepEqual(
    separateEstimate.properties.map((propertyEstimate) => propertyEstimate.travelAdjustmentCents),
    [3000, 3000]
  );
  for (const estimate of [sharedEstimate, separateEstimate]) {
    assert.equal(
      estimate.properties.reduce((sum, propertyEstimate) => (
        sum + propertyEstimate.travelAdjustmentCents
      ), 0),
      estimate.travelAdjustmentCents
    );
    for (const propertyEstimate of estimate.properties) {
      assert.equal(
        propertyEstimate.estimatedMonthlyCents,
        propertyEstimate.baseVisitCents + propertyEstimate.travelAdjustmentCents
      );
    }
  }
  assert.ok(sharedEstimate.estimatedMonthlyCents < separateEstimate.estimatedMonthlyCents);
});

test("routing-provider failure uses coordinate modeling and requires manual review", async () => {
  const resolved = await resolveBoutiqueTravelContext({
    properties: [property(1)],
    homeBase: { id: "base", name: "Operations base", lat: 32.25, lng: -110.93 },
    routingClient: {
      async getDrivingMatrix() {
        const error = new Error("provider secret detail");
        error.code = "PRICING_ROUTING_TIMEOUT";
        throw error;
      },
    },
  });
  const estimate = estimateBoutiquePricing(resolved);
  assert.equal(estimate.geography.method, "modeled_coordinates");
  assert.deepEqual(estimate.geography.providerFallback, { code: "PRICING_ROUTING_TIMEOUT" });
  assert.deepEqual(estimate.manualReviewReasons, ["routing_provider_fallback"]);
  assert.equal(JSON.stringify(estimate).includes("provider secret detail"), false);
});
