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
