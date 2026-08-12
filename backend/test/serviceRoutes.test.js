const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createServiceRouteHandlers,
  createServiceRouteRouter,
} = require("../Routes/serviceRoutes");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function organization() {
  return {
    properties: [
      { _id: "p1", name: "Spanish Trail Plaza", region: "Tucson - East/Central", lat: 32.2, lng: -110.8 },
      { _id: "p2", name: "Broadway Center", region: "Tucson - East/Central", lat: 32.221219, lng: -110.872634 },
    ],
    routes: [{
      _id: "r1",
      name: "Tucson - East/Central",
      region: "Tucson - East/Central",
      propertyIds: ["p1", "p2"],
      assignedUserIds: [],
      status: "active",
      version: 1,
    }],
  };
}

test("service route API exposes route administration and ordering paths", () => {
  const router = createServiceRouteRouter();
  assert.deepEqual(router.stack.filter((layer) => layer.route).map((layer) => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods),
  })), [
    { path: "/", methods: ["get"] },
    { path: "/", methods: ["post"] },
    { path: "/suggest-order", methods: ["post"] },
    { path: "/:routeId", methods: ["put"] },
    { path: "/:routeId/status", methods: ["put"] },
  ]);
});

test("route order suggestion uses current road travel metrics and corrected property coordinates", async () => {
  let routedPoints;
  const handlers = createServiceRouteHandlers({
    OrganizationModel: { async findById() { return organization(); } },
    routingClientResolver: () => ({
      async getDrivingMatrix(points) {
        routedPoints = points;
        return {
          provider: "mapbox",
          durationsSeconds: [[0, 300], [300, 0]],
          distancesMeters: [[0, 4000], [4000, 0]],
        };
      },
    }),
  });
  const res = response();

  await handlers.suggestRouteOrder({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    body: { propertyIds: ["p1", "p2"] },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.method, "road_matrix");
  assert.deepEqual(res.body.orderedPropertyIds, ["p1", "p2"]);
  assert.deepEqual(routedPoints[1], {
    id: "p2",
    name: "Broadway Center",
    lat: 32.221219,
    lng: -110.872634,
  });
});

test("route stop changes require confirmation when scheduled assignments keep the old snapshot", async () => {
  const savedOrganization = organization();
  savedOrganization.save = async () => {};
  let impactQuery;
  let auditCount = 0;
  const handlers = createServiceRouteHandlers({
    OrganizationModel: { async findById() { return savedOrganization; } },
    RouteRunModel: {
      async countDocuments(query) {
        impactQuery = query;
        return 2;
      },
    },
    PlatformAuditModel: { async create() { auditCount += 1; } },
  });
  const request = {
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    params: { routeId: "r1" },
    body: {
      name: "Tucson - East/Central",
      region: "Tucson - East/Central",
      propertyIds: ["p2", "p1"],
    },
    get: () => "",
  };
  const warning = response();

  await handlers.updateRoute(request, warning);

  assert.equal(warning.statusCode, 409);
  assert.deepEqual(warning.body, {
    error: "This route has scheduled assignments that will keep their existing stop snapshots.",
    code: "ROUTE_SNAPSHOT_CONFIRMATION_REQUIRED",
    scheduledRouteAssignmentCount: 2,
    currentStopCount: 2,
    updatedStopCount: 2,
  });
  assert.deepEqual(impactQuery, {
    organizationId: "org-1",
    routeId: "r1",
    status: "scheduled",
  });
  assert.deepEqual(savedOrganization.routes[0].propertyIds, ["p1", "p2"]);
  assert.equal(auditCount, 0);

  const confirmed = response();
  await handlers.updateRoute({
    ...request,
    body: { ...request.body, confirmScheduledSnapshotImpact: true },
  }, confirmed);

  assert.equal(confirmed.statusCode, 200);
  assert.deepEqual(savedOrganization.routes[0].propertyIds, ["p2", "p1"]);
  assert.equal(savedOrganization.routes[0].version, 2);
  assert.equal(auditCount, 1);
});

test("route metadata edits do not require scheduled snapshot confirmation", async () => {
  const savedOrganization = organization();
  savedOrganization.save = async () => {};
  const handlers = createServiceRouteHandlers({
    OrganizationModel: { async findById() { return savedOrganization; } },
    RouteRunModel: {
      async countDocuments() {
        assert.fail("metadata-only edits must not query scheduled route impact");
      },
    },
    PlatformAuditModel: { async create() {} },
  });
  const res = response();

  await handlers.updateRoute({
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    params: { routeId: "r1" },
    body: {
      name: "East - Central",
      region: "Tucson - East/Central",
      propertyIds: ["p1", "p2"],
    },
    get: () => "",
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(savedOrganization.routes[0].name, "East - Central");
});
