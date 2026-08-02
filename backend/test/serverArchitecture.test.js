const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function routeInventory(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));
}

test("server entry point contains lifecycle wiring rather than API handlers", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(source, /if \(require\.main === module\)/);
  assert.match(source, /createApp\(\)\.listen/);
  assert.doesNotMatch(source, /app\.(get|post|put|delete|patch)\(/);
});

test("authentication router preserves public session and recovery paths", () => {
  assert.deepEqual(routeInventory(require("../Routes/auth")), [
    { path: "/register", methods: ["post"] },
    { path: "/login", methods: ["post"] },
    { path: "/auth/mfa/enrollment/start", methods: ["post"] },
    { path: "/auth/mfa/enrollment/confirm", methods: ["post"] },
    { path: "/auth/mfa/verify", methods: ["post"] },
    { path: "/auth/okta/challenge", methods: ["post"] },
    { path: "/auth/okta", methods: ["post"] },
    { path: "/auth/refresh", methods: ["post"] },
    { path: "/auth/workspace", methods: ["post"] },
    { path: "/auth/logout", methods: ["post"] },
    { path: "/forgot-password", methods: ["post"] },
    { path: "/reset-password", methods: ["post"] },
  ]);
});

test("submission router preserves history paths", () => {
  assert.deepEqual(routeInventory(require("../Routes/submissions")), [
    { path: "/recent-submissions", methods: ["get"] },
    { path: "/submissions", methods: ["get"] },
    { path: "/admin/submissions/:property", methods: ["get"] },
  ]);
});

test("property administration and access-instruction paths remain stable", () => {
  assert.deepEqual(routeInventory(require("../Routes/propertyAdministration")), [
    { path: "/add-property", methods: ["post"] },
    { path: "/edit-property/:propertyName", methods: ["put"] },
    { path: "/property/:propertyName", methods: ["delete"] },
  ]);
  assert.deepEqual(routeInventory(require("../Routes/accessInstructions")), [
    { path: "/:propertyName", methods: ["get"] },
    { path: "/:propertyName", methods: ["put"] },
  ]);
});

test("billing router exposes the platform-owned service invoice lifecycle", () => {
  const inventory = routeInventory(require("../Routes/billing"));
  for (const route of [
    { path: "/platform-service-invoices", methods: ["get"] },
    { path: "/platform-service-invoices/:id/amount", methods: ["put"] },
    { path: "/platform-service-invoices/:id/generate", methods: ["post"] },
    { path: "/platform-service-invoices/:id/submit", methods: ["post"] },
    { path: "/platform-service-invoices/:id/mark-paid", methods: ["post"] },
  ]) {
    assert.deepEqual(inventory.find((candidate) => candidate.path === route.path), route);
  }
});
