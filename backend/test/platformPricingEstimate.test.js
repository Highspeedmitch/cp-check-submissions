const test = require("node:test");
const assert = require("node:assert/strict");
const authenticateToken = require("../middleware/authenticateToken");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");
const platformRouter = require("../Routes/platform");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function pricingRoute() {
  return platformRouter.stack.find(
    (layer) => layer.route?.path === "/pricing-estimate"
  ).route;
}

function pricingLocationRoute() {
  return platformRouter.stack.find(
    (layer) => layer.route?.path === "/pricing-locations"
  ).route;
}

test("platform pricing estimation is protected by authentication and platform scope", () => {
  const route = pricingRoute();
  assert.deepEqual(Object.keys(route.methods), ["post"]);
  assert.equal(route.stack[0].handle, authenticateToken);
  assert.equal(route.stack[1].handle, requirePlatformAdmin);
  const locationRoute = pricingLocationRoute();
  assert.deepEqual(Object.keys(locationRoute.methods), ["post"]);
  assert.equal(locationRoute.stack[0].handle, authenticateToken);
  assert.equal(locationRoute.stack[1].handle, requirePlatformAdmin);
});

test("platform address search returns provider candidates without home-base details", async () => {
  let searchQuery;
  let searchProximity;
  const handler = platformRouter.createPricingLocationSearchHandler({
    pricingClientResolver: () => ({
      async searchAddresses(query, { proximity }) {
        searchQuery = query;
        searchProximity = proximity;
        return [{
          locationId: "address.1",
          label: "100 Example Road, Tucson, Arizona",
          lat: 32.22,
          lng: -110.88,
          confidence: "high",
          accuracy: "rooftop",
        }];
      },
    }),
    homeBaseResolver: () => ({
      id: "operations_base",
      name: "Tucson operations base",
      lat: 32.25,
      lng: -110.93,
    }),
  });
  const res = response();
  await handler({ body: { query: "100 Example Road" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(searchQuery, "100 Example Road");
  assert.equal(searchProximity.lat, 32.25);
  assert.equal(res.body.results[0].locationId, "address.1");
  assert.equal(res.body.homeBase, undefined);
});

test("platform pricing estimation reuses the bid pricing contract without persistence", () => {
  const res = response();
  pricingRoute().stack[2].handle({
    body: {
      grossSquareFeet: 40000,
      propertyType: "strip_mall",
      serviceFrequency: "monthly",
      hasKnownIssues: false,
      includeManagedServiceFee: true,
      managedServiceTier: "tier_2",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.version, 7);
  assert.equal(res.body.estimatedPerVisitCents, 20000);
  assert.equal(res.body.estimatedMonthlyCents, 20000);
  assert.equal(res.body.managedService.tier, "tier_2");
  assert.equal(res.body.managedService.baseMonthlyFeeCents, 125000);
  assert.equal(res.body.managedService.estimatedContractMonthlyCents, 145000);
  assert.equal(res.body.requiresManualReview, false);
});

test("platform pricing estimation calculates eligible property clusters", () => {
  const res = response();
  pricingRoute().stack[2].handle({
    body: {
      pricingMode: "cluster",
      properties: [
        { grossSquareFeet: 1500, propertyType: "free_standing" },
        { grossSquareFeet: 1500, propertyType: "free_standing" },
        { grossSquareFeet: 1500, propertyType: "free_standing" },
      ],
      serviceFrequency: "monthly",
      withinHalfMile: true,
      sameScheduledVisit: true,
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pricingMode, "cluster");
  assert.equal(res.body.standalonePerVisitCents, 15000);
  assert.equal(res.body.estimatedPerVisitCents, 10000);
});

test("platform pricing estimation calculates a Boutique contract from backend road travel", async () => {
  let matrixPoints;
  const handler = platformRouter.createPricingEstimateHandler({
    OrganizationModel: {
      findById() { throw new Error("Boutique prospect pricing must not query an organization"); },
    },
    homeBaseResolver: () => ({
      id: "operations-base",
      name: "Tucson operations base",
      lat: 32.25,
      lng: -110.93,
    }),
    routingClientResolver: () => ({
      async getDrivingMatrix(points) {
        matrixPoints = points;
        return {
          provider: "mapbox",
          distancesMeters: [
            [0, 15 * 1609.344],
            [15 * 1609.344, 0],
          ],
          durationsSeconds: [
            [0, 30 * 60],
            [30 * 60, 0],
          ],
        };
      },
    }),
  });
  const res = response();
  await handler({ body: {
    pricingMode: "boutique",
    properties: [{
      grossSquareFeet: 1500,
      propertyType: "free_standing",
      candidate: {
        id: "address.1",
        name: "Small Office",
        lat: 32.22,
        lng: -110.88,
      },
    }],
    sameScheduledVisit: true,
  } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.version, "boutique-1");
  assert.equal(res.body.pricingMode, "boutique");
  assert.equal(res.body.baseVisitTotalCents, 5000);
  assert.equal(res.body.travelAdjustmentCents, 3000);
  assert.equal(res.body.estimatedMonthlyCents, 8000);
  assert.equal(res.body.boutiqueService.baseMonthlyFeeCents, 7500);
  assert.equal(res.body.boutiqueService.estimatedContractMonthlyCents, 15500);
  assert.equal(res.body.properties[0].baseVisitCents, 5000);
  assert.equal(res.body.properties[0].travelAdjustmentCents, 3000);
  assert.equal(res.body.properties[0].estimatedMonthlyCents, 8000);
  assert.equal(res.body.geography.method, "road_matrix");
  assert.equal(matrixPoints.length, 2);
  assert.equal(JSON.stringify(res.body).includes("32.25"), false);
  assert.equal(JSON.stringify(res.body).includes("-110.93"), false);
});

test("platform Boutique pricing rejects a fourth property and the exclusive size boundary", async () => {
  const handler = platformRouter.createPricingEstimateHandler({
    homeBaseResolver: () => ({ lat: 32.25, lng: -110.93 }),
    routingClientResolver: () => null,
  });
  const candidate = (index, grossSquareFeet = 1000) => ({
    grossSquareFeet,
    propertyType: "free_standing",
    candidate: { lat: 32.2 + (index / 100), lng: -110.9 - (index / 100) },
  });
  const tooMany = response();
  await handler({ body: {
    pricingMode: "boutique",
    properties: [candidate(1), candidate(2), candidate(3), candidate(4)],
  } }, tooMany);
  assert.equal(tooMany.statusCode, 400);
  assert.match(tooMany.body.error, /between 1 and 3 properties/i);

  const tooLarge = response();
  await handler({ body: {
    pricingMode: "boutique",
    properties: [candidate(1, 5000)],
  } }, tooLarge);
  assert.equal(tooLarge.statusCode, 409);
  assert.match(tooLarge.body.error, /under 5,000 square feet/i);

  const weekly = response();
  await handler({ body: {
    pricingMode: "boutique",
    serviceFrequency: "weekly",
    properties: [candidate(1)],
  } }, weekly);
  assert.equal(weekly.statusCode, 400);
  assert.match(weekly.body.error, /only for monthly visits/i);
});

test("platform pricing estimation returns safe validation errors", () => {
  const res = response();
  pricingRoute().stack[2].handle({
    body: {
      grossSquareFeet: 0,
      propertyType: "free_standing",
      serviceFrequency: "monthly",
    },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    error: "Gross square footage must be a positive number.",
  });
});

test("platform pricing estimation derives road-matrix portfolio context on the backend", async () => {
  const organization = {
    _id: "organization-1",
    name: "Example Organization",
    serviceModel: "managed",
    fulfillmentPolicy: { defaultSource: "afterlight_staff" },
    properties: [
      { _id: "property-1", name: "Existing Property", lat: 32.21, lng: -110.89 },
      { _id: "property-2", name: "Internal Property", lat: 32.22, lng: -110.9,
        fulfillmentPolicy: { defaultSource: "customer_employee" } },
    ],
    routes: [{
      _id: "route-1",
      name: "East/Central",
      region: "Tucson - East/Central",
      propertyIds: ["property-1"],
      status: "active",
      version: 2,
    }],
  };
  const query = {
    select() { return this; },
    lean() { return Promise.resolve(organization); },
  };
  const handler = platformRouter.createPricingEstimateHandler({
    OrganizationModel: { findById: () => query },
    homeBaseResolver: () => ({
      id: "operations_base",
      name: "Tucson operations base",
      lat: 32.25,
      lng: -110.93,
    }),
    routingClientResolver: () => ({
      async getDrivingMatrix() {
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
    }),
  });
  const res = response();
  await handler({
    body: {
      pricingMode: "route_aware",
      organizationId: "organization-1",
      routeId: "route-1",
      candidate: { id: "address.1", name: "Candidate", lat: 32.22, lng: -110.88 },
      routeCommitment: "modeled",
      grossSquareFeet: 18000,
      propertyType: "free_standing",
      serviceFrequency: "monthly",
      hasKnownIssues: false,
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.version, 7);
  assert.equal(res.body.pricingMode, "route_aware");
  assert.equal(res.body.organization.name, "Example Organization");
  assert.equal(res.body.geography.portfolio.propertyCount, 1);
  assert.equal(res.body.geography.route.routeId, "route-1");
  assert.equal(res.body.geography.route.routeVersion, 2);
  assert.equal(res.body.geography.method, "road_matrix");
  assert.equal(res.body.geography.home.lat, undefined);
  assert.deepEqual(res.body.manualReviewReasons, []);
});

test("platform route-aware pricing rejects a full saved route", async () => {
  const propertyIds = ["one", "two", "three", "four", "five", "six"];
  const organization = {
    _id: "organization-1",
    name: "Example",
    serviceModel: "managed",
    fulfillmentPolicy: { defaultSource: "afterlight_staff" },
    properties: propertyIds.map((id, index) => ({
      _id: id,
      name: id,
      lat: 32.2 + (index / 100),
      lng: -110.9 - (index / 100),
    })),
    routes: [{
      _id: "route-full",
      name: "Full route",
      propertyIds,
      status: "active",
    }],
  };
  const handler = platformRouter.createPricingEstimateHandler({
    OrganizationModel: { findById: () => Promise.resolve(organization) },
    homeBaseResolver: () => ({ lat: 32.25, lng: -110.93 }),
  });
  const res = response();
  await handler({ body: {
    pricingMode: "route_aware",
    organizationId: "organization-1",
    routeId: "route-full",
    candidate: { lat: 32.22, lng: -110.88 },
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
  } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /maximum of 6 properties/);
});

test("platform pricing estimation falls back safely when road routing is unavailable", async () => {
  const handler = platformRouter.createPricingEstimateHandler({
    OrganizationModel: {
      findById: () => Promise.resolve({
        _id: "organization-1",
        name: "Example",
        serviceModel: "managed",
        fulfillmentPolicy: { defaultSource: "afterlight_staff" },
        properties: [],
      }),
    },
    homeBaseResolver: () => ({
      id: "operations_base",
      name: "Tucson operations base",
      lat: 32.25,
      lng: -110.93,
    }),
    routingClientResolver: () => ({
      async getDrivingMatrix() {
        const error = new Error("private token or provider detail");
        error.code = "PRICING_ROUTING_TIMEOUT";
        throw error;
      },
    }),
  });
  const res = response();
  await handler({ body: {
    pricingMode: "route_aware",
    organizationId: "organization-1",
    candidate: { id: "address.1", name: "Candidate", lat: 32.22, lng: -110.88 },
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.geography.method, "modeled_coordinates");
  assert.equal(res.body.geography.route.source, "standalone");
  assert.equal(res.body.geography.route.stopCount, 0);
  assert.equal(res.body.geography.route.commitment, "none");
  assert.deepEqual(res.body.manualReviewReasons, ["routing_provider_fallback"]);
  assert.equal(JSON.stringify(res.body).includes("private token or provider detail"), false);
});

test("route-aware estimates require organization and backend home-base configuration", async () => {
  const handler = platformRouter.createPricingEstimateHandler({
    OrganizationModel: {
      findById: () => ({
        select() { return this; },
        lean() { return Promise.resolve({
          _id: "organization-1",
          name: "Example",
          serviceModel: "managed",
          fulfillmentPolicy: { defaultSource: "afterlight_staff" },
          properties: [],
        }); },
      }),
    },
    homeBaseResolver: () => {
      const error = new Error("The Tucson operations base is not configured for route-aware pricing.");
      error.status = 503;
      throw error;
    },
  });
  const missingOrganization = response();
  await handler({ body: { pricingMode: "route_aware" } }, missingOrganization);
  assert.equal(missingOrganization.statusCode, 400);

  const missingBase = response();
  await handler({ body: {
    pricingMode: "route_aware",
    organizationId: "organization-1",
    candidate: { lat: 32.22, lng: -110.88 },
    grossSquareFeet: 18000,
    propertyType: "free_standing",
    serviceFrequency: "monthly",
  } }, missingBase);
  assert.equal(missingBase.statusCode, 503);
  assert.match(missingBase.body.error, /not configured/);
});

test("route-aware organization lookup failures do not expose database errors", async () => {
  const castError = new Error("Cast to ObjectId failed for value private-detail");
  castError.name = "CastError";
  const invalidIdHandler = platformRouter.createPricingEstimateHandler({
    OrganizationModel: { findById: () => Promise.reject(castError) },
  });
  const invalidIdResponse = response();
  await invalidIdHandler({ body: {
    pricingMode: "route_aware",
    organizationId: "invalid",
  } }, invalidIdResponse);
  assert.equal(invalidIdResponse.statusCode, 400);
  assert.deepEqual(invalidIdResponse.body, { error: "Select a valid organization." });

  const unavailableHandler = platformRouter.createPricingEstimateHandler({
    OrganizationModel: { findById: () => Promise.reject(new Error("database host detail")) },
  });
  const unavailableResponse = response();
  await unavailableHandler({ body: {
    pricingMode: "route_aware",
    organizationId: "organization-1",
  } }, unavailableResponse);
  assert.equal(unavailableResponse.statusCode, 500);
  assert.deepEqual(unavailableResponse.body, {
    error: "Unable to load the organization pricing context.",
  });
});
