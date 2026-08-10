const test = require("node:test");
const assert = require("node:assert/strict");
const {
  haversineMiles,
  portfolioDensity,
  buildModeledTravelContext,
  buildRoadMatrixTravelContext,
} = require("../services/pricingGeography");

const home = { id: "home", name: "Operations base", lat: 32.25, lng: -110.93 };

test("haversine distance is deterministic and symmetric", () => {
  const first = { lat: 32.22, lng: -110.88 };
  const second = { lat: 32.20, lng: -110.92 };
  assert.equal(haversineMiles(first, first), 0);
  assert.ok(Math.abs(haversineMiles(first, second) - haversineMiles(second, first)) < 1e-9);
});

test("portfolio density rewards nearby properties with bounded marginal utility", () => {
  const candidate = { lat: 32.22, lng: -110.88 };
  const nearby = portfolioDensity(candidate, [
    { id: "near", lat: 32.221, lng: -110.881 },
    { id: "second", lat: 32.225, lng: -110.885 },
  ]);
  const distant = portfolioDensity(candidate, [
    { id: "far", lat: 32.40, lng: -111.10 },
  ]);
  assert.ok(nearby.densityScore > distant.densityScore);
  assert.ok(nearby.densityScore > 0 && nearby.densityScore < 1);
  assert.ok(distant.densityScore >= 0 && distant.densityScore < 1);
});

test("modeled route finds a low-detour insertion and ignores invalid portfolio coordinates", () => {
  const context = buildModeledTravelContext({
    homeBase: home,
    candidate: { name: "Candidate", lat: 32.22, lng: -110.88 },
    portfolioProperties: [
      { id: "a", name: "A", lat: 32.21, lng: -110.89 },
      { id: "invalid", name: "Invalid", lat: null, lng: null },
      { id: "b", name: "B", lat: 32.20, lng: -110.92 },
    ],
    routeCommitment: "confirmed",
  });
  assert.equal(context.method, "modeled_coordinates");
  assert.equal(context.portfolio.propertyCount, 2);
  assert.equal(context.route.confidence, 1);
  assert.deepEqual(context.route.modeledStopNames, ["B", "A"]);
  assert.ok(context.route.additionalMiles < context.home.roundTripMiles);
  assert.equal(context.candidate.name, "Candidate");
});

test("route confidence is zero without an eligible portfolio", () => {
  const context = buildModeledTravelContext({
    homeBase: home,
    candidate: { lat: 32.22, lng: -110.88 },
    portfolioProperties: [],
    routeCommitment: "confirmed",
  });
  assert.equal(context.portfolio.densityScore, 0);
  assert.equal(context.route.confidence, 0);
  assert.equal(context.route.additionalMiles, context.home.roundTripMiles);
});

test("saved route pricing preserves administrator stop order", () => {
  const context = buildModeledTravelContext({
    homeBase: home,
    candidate: { name: "Candidate", lat: 32.22, lng: -110.88 },
    portfolioProperties: [
      { id: "far", name: "Far first", lat: 32.10, lng: -111.10 },
      { id: "near", name: "Near second", lat: 32.221, lng: -110.881 },
    ],
    routeCommitment: "modeled",
    preservePortfolioOrder: true,
    routeMetadata: { source: "saved_route", routeId: "route-1", routeVersion: 2 },
  });
  assert.deepEqual(context.route.modeledStopNames, ["Far first", "Near second"]);
  assert.equal(context.route.routeId, "route-1");
  assert.equal(context.route.routeVersion, 2);
});

test("route commitment validation rejects unsupported assumptions", () => {
  assert.throws(() => buildModeledTravelContext({
    homeBase: home,
    candidate: { lat: 32.22, lng: -110.88 },
    routeCommitment: "guaranteed",
  }), /valid route commitment/);
});

test("road matrices drive home travel, portfolio distance, and route insertion", () => {
  const miles = [
    [0, 10, 5, 10],
    [10, 0, 1, 8],
    [5, 1, 0, 5],
    [10, 8, 5, 0],
  ];
  const minutes = [
    [0, 24, 12, 24],
    [24, 0, 3, 20],
    [12, 3, 0, 12],
    [24, 20, 12, 0],
  ];
  const context = buildRoadMatrixTravelContext({
    homeBase: home,
    candidate: { id: "candidate", name: "Candidate", lat: 32.22, lng: -110.88 },
    portfolioProperties: [
      { id: "a", name: "A", lat: 32.21, lng: -110.89 },
      { id: "b", name: "B", lat: 32.20, lng: -110.92 },
    ],
    routeCommitment: "modeled",
    matrix: {
      provider: "mapbox",
      profile: "mapbox/driving",
      distancesMeters: miles.map((row) => row.map((value) => value * 1609.344)),
      durationsSeconds: minutes.map((row) => row.map((value) => value * 60)),
    },
  });
  assert.equal(context.method, "road_matrix");
  assert.equal(context.provider, "mapbox");
  assert.equal(context.home.roundTripMiles, 20);
  assert.equal(context.home.roundTripMinutes, 48);
  assert.equal(context.portfolio.nearestPropertyDistanceMiles, 1);
  assert.equal(context.route.additionalMiles, 4);
  assert.equal(context.route.additionalMinutes, 11);
  assert.equal(context.route.insertionAfterPropertyName, "A");
  assert.equal(context.route.insertionBeforePropertyName, "B");
  assert.equal(context.route.confidence, 0.6);
  assert.deepEqual(context.route.modeledStopNames, ["A", "B"]);
  assert.equal(context.home.lat, undefined);
});

test("road matrix context rejects incomplete routes", () => {
  assert.throws(() => buildRoadMatrixTravelContext({
    homeBase: home,
    candidate: { lat: 32.22, lng: -110.88 },
    matrix: { distancesMeters: [[0]], durationsSeconds: [[0]] },
  }), /incomplete pricing matrix/);
});
