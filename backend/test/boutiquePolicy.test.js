const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BOUTIQUE_ADMIN_LIMIT,
  BOUTIQUE_MAX_PROPERTIES,
  BOUTIQUE_MAX_PROPERTY_SQUARE_FEET_EXCLUSIVE,
  BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS,
  BOUTIQUE_USER_LIMIT,
  isBoutiqueServiceModel,
  normalizePropertySquareFeet,
  normalizePropertyType,
  requireBoutiqueInspectionAssignment,
  serviceModelIncludesPortfolioReporting,
  validateBoutiqueOrganizationType,
  validateBoutiquePortfolio,
} = require("../services/boutiquePolicy");

test("Boutique policy constants preserve the approved economic and capacity contract", () => {
  assert.equal(BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS, 7500);
  assert.equal(BOUTIQUE_ADMIN_LIMIT, 1);
  assert.equal(BOUTIQUE_USER_LIMIT, 2);
  assert.equal(BOUTIQUE_MAX_PROPERTIES, 3);
  assert.equal(BOUTIQUE_MAX_PROPERTY_SQUARE_FEET_EXCLUSIVE, 5000);
});

test("Boutique property-size validation uses an exclusive 5,000-square-foot ceiling", () => {
  assert.equal(normalizePropertySquareFeet(4999, "boutique"), 4999);
  assert.equal(normalizePropertySquareFeet("1500", "boutique"), 1500);
  assert.throws(
    () => normalizePropertySquareFeet(5000, "boutique"),
    (error) => error.status === 409 && error.code === "BOUTIQUE_PROPERTY_SIZE_EXCEEDED"
  );
  assert.throws(
    () => normalizePropertySquareFeet(null, "boutique"),
    (error) => error.status === 400 && error.code === "BOUTIQUE_PROPERTY_SIZE_REQUIRED"
  );
  assert.throws(
    () => normalizePropertySquareFeet(12.5, "boutique"),
    (error) => error.status === 400 && error.code === "PROPERTY_SIZE_INVALID"
  );
  assert.equal(normalizePropertySquareFeet(null, "managed"), null);
  assert.equal(normalizePropertySquareFeet(5000, "managed"), 5000);
});

test("Boutique property types use a safe free-standing default and reject unknown values", () => {
  assert.equal(normalizePropertyType("", "boutique"), "free_standing");
  assert.equal(normalizePropertyType("strip_mall", "boutique"), "strip_mall");
  assert.throws(
    () => normalizePropertyType("warehouse", "boutique"),
    (error) => error.code === "PROPERTY_TYPE_INVALID"
  );
});

test("Boutique eligibility is restricted to explicitly commercial organizations", () => {
  assert.equal(validateBoutiqueOrganizationType({
    serviceModel: "boutique",
    orgType: "COM",
  }), true);
  assert.throws(
    () => validateBoutiqueOrganizationType({ serviceModel: "boutique", orgType: "RES" }),
    (error) => error.status === 409
      && error.code === "BOUTIQUE_ORGANIZATION_TYPE_NOT_ELIGIBLE"
  );
  assert.throws(
    () => validateBoutiqueOrganizationType({ serviceModel: "boutique" }),
    (error) => error.status === 409
      && error.code === "BOUTIQUE_ORGANIZATION_TYPE_NOT_ELIGIBLE"
  );
  assert.equal(validateBoutiqueOrganizationType({
    serviceModel: "managed",
    orgType: "RES",
  }), true);
});

test("Boutique portfolio validation checks both count and every saved property size", () => {
  assert.equal(validateBoutiquePortfolio({
    serviceModel: "boutique",
    orgType: "COM",
    properties: [
      { name: "One", grossSquareFeet: 1000 },
      { name: "Two", grossSquareFeet: 2500 },
      { name: "Three", grossSquareFeet: 4999 },
    ],
  }), true);
  assert.throws(() => validateBoutiquePortfolio({
    serviceModel: "boutique",
    orgType: "COM",
    properties: [
      { name: "One", grossSquareFeet: 1000 },
      { name: "Two", grossSquareFeet: 2000 },
      { name: "Three", grossSquareFeet: 3000 },
      { name: "Four", grossSquareFeet: 4000 },
    ],
  }), (error) => error.code === "BOUTIQUE_PROPERTY_LIMIT_EXCEEDED");
  assert.throws(() => validateBoutiquePortfolio({
    serviceModel: "boutique",
    orgType: "COM",
    properties: [{ name: "Unknown size", grossSquareFeet: null }],
  }), (error) => error.code === "BOUTIQUE_PROPERTY_SIZE_REQUIRED"
    && /Unknown size/.test(error.message));
  assert.doesNotThrow(() => validateBoutiquePortfolio({
    serviceModel: "managed",
    properties: Array.from({ length: 10 }, (_, index) => ({ name: String(index) })),
  }));
});

test("portfolio reporting is a service-plan capability and Boutique is excluded", () => {
  assert.equal(isBoutiqueServiceModel("boutique"), true);
  assert.equal(isBoutiqueServiceModel({ serviceModel: "boutique" }), true);
  assert.equal(serviceModelIncludesPortfolioReporting("boutique"), false);
  for (const serviceModel of ["platform", "hybrid", "managed"]) {
    assert.equal(serviceModelIncludesPortfolioReporting(serviceModel), true);
  }
});

test("Boutique inspections require an assignment while existing assigned work remains valid", () => {
  assert.throws(
    () => requireBoutiqueInspectionAssignment("boutique", null),
    (error) => error.status === 403
      && error.code === "BOUTIQUE_ASSIGNMENT_REQUIRED"
      && error.permanent === true
  );
  assert.equal(requireBoutiqueInspectionAssignment("boutique", { _id: "assignment-1" }), true);
  assert.equal(requireBoutiqueInspectionAssignment("managed", null), true);
});
