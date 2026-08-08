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

test("platform pricing estimation is protected by authentication and platform scope", () => {
  const route = pricingRoute();
  assert.deepEqual(Object.keys(route.methods), ["post"]);
  assert.equal(route.stack[0].handle, authenticateToken);
  assert.equal(route.stack[1].handle, requirePlatformAdmin);
});

test("platform pricing estimation reuses the bid pricing contract without persistence", () => {
  const res = response();
  pricingRoute().stack[2].handle({
    body: {
      grossSquareFeet: 18000,
      propertyType: "strip_mall",
      serviceFrequency: "weekly",
      hasKnownIssues: false,
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.version, 2);
  assert.equal(res.body.estimatedPerVisitCents, 25000);
  assert.equal(res.body.estimatedMonthlyCents, 90000);
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
  assert.equal(res.body.standalonePerVisitCents, 22500);
  assert.equal(res.body.estimatedPerVisitCents, 15000);
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
