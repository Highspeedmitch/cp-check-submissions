const test = require("node:test");
const assert = require("node:assert/strict");
const {
  operationsBaseFromEnvironment,
  routeEligiblePortfolioProperties,
  pricingRouteScope,
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
      routes: [{
        _id: "route-one",
        name: "East/Central",
        region: "Tucson - East/Central",
        propertyIds: ["one"],
        status: "active",
        version: 3,
      }],
    },
    routeId: "route-one",
    candidate: { name: "Candidate", lat: 32.22, lng: -110.88 },
    homeBase: { id: "home", name: "Private", lat: 32.25, lng: -110.93 },
  });
  assert.equal(context.portfolio.propertyCount, 1);
  assert.equal(context.route.routeName, "East/Central");
  assert.equal(context.route.routeVersion, 3);
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
      routes: [{
        _id: "route-one",
        name: "East/Central",
        region: "Tucson - East/Central",
        propertyIds: ["one"],
        status: "active",
      }],
    },
    routeId: "route-one",
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
  assert.equal(context.route.source, "saved_route");
});

test("pricing route scope follows the saved stop order and rejects unavailable capacity", () => {
  const properties = ["one", "two", "three", "four", "five", "six"].map((id, index) => ({
    _id: id,
    name: id,
    lat: 32.2 + (index / 100),
    lng: -110.9 - (index / 100),
  }));
  const organization = {
    serviceModel: "managed",
    fulfillmentPolicy: { defaultSource: "afterlight_staff" },
    properties,
    routes: [
      {
        _id: "ordered",
        name: "Ordered route",
        region: "Tucson East",
        propertyIds: ["three", "one", "two"],
        status: "active",
        version: 4,
      },
      {
        _id: "full",
        name: "Full route",
        region: "Tucson East",
        propertyIds: properties.map((property) => property._id),
        status: "active",
      },
      {
        _id: "archived",
        name: "Archived route",
        propertyIds: ["one", "two"],
        status: "archived",
      },
    ],
  };

  const scope = pricingRouteScope(organization, "ordered");
  assert.deepEqual(scope.portfolioProperties.map((property) => property.id), [
    "three", "one", "two",
  ]);
  assert.deepEqual(scope.routeMetadata, {
    source: "saved_route",
    routeId: "ordered",
    routeName: "Ordered route",
    routeRegion: "Tucson East",
    routeVersion: 4,
    stopCount: 3,
    maximumStops: 6,
    capacityRemaining: 3,
  });
  assert.throws(() => pricingRouteScope(organization, "full"), (error) => (
    error.status === 409 && /maximum of 6/.test(error.message)
  ));
  assert.throws(() => pricingRouteScope(organization, "archived"), /active property route/);
});

test("standalone pricing has no implicit portfolio or region credit", () => {
  const scope = pricingRouteScope({ properties: [{ _id: "one", region: "Tucson East" }] });
  assert.deepEqual(scope.portfolioProperties, []);
  assert.equal(scope.routeCommitment, "none");
  assert.equal(scope.routeMetadata.source, "standalone");
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
