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
    { path: "/auth/mfa/step-up/challenge", methods: ["post"] },
    { path: "/auth/mfa/step-up/verify", methods: ["post"] },
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

test("client and AzRoots routes rely on centralized authentication", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(
    appSource,
    /app\.use\("\/api\/client", authenticateToken, requireCurrentOrganizationPresence, require\("\.\/Routes\/ClientRoutes"\)\)/
  );
  assert.match(
    appSource,
    /app\.use\("\/api\/azroots\/properties", authenticateToken, requireCurrentOrganizationPresence, require\("\.\/Routes\/azrootsProperties"\)\)/
  );

  for (const routeFile of ["ClientRoutes.js", "azrootsProperties.js"]) {
    const routeSource = fs.readFileSync(
      path.join(__dirname, "..", "Routes", routeFile),
      "utf8"
    );
    assert.doesNotMatch(routeSource, /authenticateToken/);
  }
});

test("retired mileage and manual payment endpoints are not mounted", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.doesNotMatch(
    appSource,
    /\/api\/mileage|mileageTracking|\/admin\/process-payment|Routes\/admin["']/
  );
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

test("secure invoice email actions are isolated in a public POST-only router", () => {
  assert.deepEqual(routeInventory(require("../Routes/invoiceEmailActions")), [
    { path: "/resolve", methods: ["post"] },
    { path: "/approve", methods: ["post"] },
  ]);
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const publicActionIndex = appSource.indexOf('"/api/invoice-email-actions"');
  const authenticatedBillingIndex = appSource.indexOf('"/api/billing"');
  assert.ok(publicActionIndex > -1);
  assert.ok(publicActionIndex < authenticatedBillingIndex);
});

test("platform resource deployments expose an editable organization and scope path", () => {
  const inventory = routeInventory(require("../Routes/platformResources"));
  assert.deepEqual(
    inventory.find((candidate) => candidate.path === "/deployments/:deploymentId/scope"),
    { path: "/deployments/:deploymentId/scope", methods: ["put"] }
  );
});

test("service model requests expose organization and platform review paths", () => {
  assert.deepEqual(routeInventory(require("../Routes/serviceModelChanges")), [
    { path: "/", methods: ["get"] },
    { path: "/", methods: ["post"] },
    { path: "/:id/respond", methods: ["post"] },
    { path: "/platform", methods: ["get"] },
    { path: "/platform/:id/review", methods: ["post"] },
  ]);
});
