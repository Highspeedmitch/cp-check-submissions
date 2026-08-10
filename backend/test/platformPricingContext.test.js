const test = require("node:test");
const assert = require("node:assert/strict");
const {
  operationsBaseFromEnvironment,
  routeEligiblePortfolioProperties,
  buildOrganizationTravelContext,
  resolveOrganizationTravelContext,
} = require("../services/platformPricingContext");

test("operations base is private backend configuration", () => {
  assert.deepEqual(operationsBaseFromEnvironment({
    AFTERLIGHT_PRICING_HOME_LAT: "32.25",
    AFTERLIGHT_PRICING_HOME_LNG: "-110.93",
  }), {
    id: "operations_base",
    name: "Tucson operations base",
    lat: 32.25,
    lng: -110.93,
  });
  assert.throws(() => operationsBaseFromEnvironment({}), /not configured/);
});

test("portfolio routing includes only geocoded Afterlight-serviced properties", () => {
  const organization = {
    serviceModel: "hybrid",
    fulfillmentPolicy: { defaultSource: "afterlight_staff" },
    properties: [
      { _id: "afterlight", name: "Afterlight", lat: 32.21, lng: -110.89 },
      { _id: "internal", name: "Internal", lat: 32.22, lng: -110.90,
        fulfillmentPolicy: { defaultSource: "customer_employee" } },
      { _id: "missing", name: "Missing coordinates" },
    ],
  };
  assert.deepEqual(routeEligiblePortfolioProperties(organization).map((property) => property.id), [
    "afterlight",
  ]);
});

test("organization travel context never returns home-base coordinates", () => {
  const context = buildOrganizationTravelContext({
    organization: {
      serviceModel: "managed",
      fulfillmentPolicy: { defaultSource: "afterlight_staff" },
      properties: [{ _id: "one", name: "One", lat: 32.21, lng: -110.89 }],
    },
    candidate: { name: "Candidate", lat: 32.22, lng: -110.88 },
    homeBase: { id: "home", name: "Private", lat: 32.25, lng: -110.93 },
  });
  assert.equal(context.portfolio.propertyCount, 1);
  assert.equal(context.home.lat, undefined);
  assert.equal(context.home.lng, undefined);
});

test("organization travel context prefers a road matrix", async () => {
  let routedPoints;
  const context = await resolveOrganizationTravelContext({
    organization: {
      serviceModel: "managed",
      fulfillmentPolicy: { defaultSource: "afterlight_staff" },
      properties: [{ _id: "one", name: "One", lat: 32.21, lng: -110.89 }],
    },
    candidate: { id: "candidate", name: "Candidate", lat: 32.22, lng: -110.88 },
    homeBase: { id: "home", name: "Private", lat: 32.25, lng: -110.93 },
    routingClient: {
      async getDrivingMatrix(points) {
        routedPoints = points;
        return {
          provider: "mapbox",
          profile: "mapbox/driving",
          distancesMeters: [
            [0, 16093.44, 8046.72],
            [16093.44, 0, 1609.344],
            [8046.72, 1609.344, 0],
          ],
          durationsSeconds: [
            [0, 1200, 600],
            [1200, 0, 180],
            [600, 180, 0],
          ],
        };
      },
    },
  });
  assert.deepEqual(routedPoints.map((point) => point.id), ["home", "candidate", "one"]);
  assert.equal(context.method, "road_matrix");
  assert.equal(context.providerFallback, undefined);
});

test("organization travel context marks the coordinate fallback", async () => {
  const routingError = new Error("private provider detail");
  routingError.code = "PRICING_ROUTING_TIMEOUT";
  const context = await resolveOrganizationTravelContext({
    organization: {
      serviceModel: "managed",
      fulfillmentPolicy: { defaultSource: "afterlight_staff" },
      properties: [],
    },
    candidate: { name: "Candidate", lat: 32.22, lng: -110.88 },
    homeBase: { id: "home", name: "Private", lat: 32.25, lng: -110.93 },
    routingClient: { getDrivingMatrix: async () => { throw routingError; } },
  });
  assert.equal(context.method, "modeled_coordinates");
  assert.deepEqual(context.providerFallback, { code: "PRICING_ROUTING_TIMEOUT" });
  assert.equal(JSON.stringify(context).includes("private provider detail"), false);
});
