const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeOrganizationSetup,
  caseInsensitiveExact,
} = require("../services/organizationProvisioning");

test("organization setup normalizes platform input and starts guided onboarding", () => {
  const setup = normalizeOrganizationSetup({
    name: "  Example   Commercial  ",
    orgType: "com",
    reportingTimezone: "America/Phoenix",
  });
  assert.deepEqual({ ...setup, onboarding: { ...setup.onboarding, initiatedAt: "timestamp" } }, {
    name: "Example Commercial",
    orgType: "COM",
    reportingTimezone: "America/Phoenix",
    serviceModel: "managed",
    license: {
      tier: "tier_1",
      adminLimit: null,
      userLimit: null,
      propertyLimit: 25,
      adminSeatVersion: 0,
      capacityVersion: 0,
    },
    fulfillmentPolicy: {
      defaultSource: "afterlight_staff",
      version: 1,
    },
    onboarding: {
      status: "invited",
      initiatedAt: "timestamp",
    },
  });
  assert.equal(setup.onboarding.initiatedAt instanceof Date, true);
});

test("organization setup rejects unsupported types and timezones", () => {
  assert.throws(() => normalizeOrganizationSetup({ name: "Example", orgType: "OTHER" }), /type/);
  assert.throws(() => normalizeOrganizationSetup({
    name: "Example",
    orgType: "COM",
    reportingTimezone: "Not/A_Timezone",
  }), /timezone/);
});

test("organization setup stores the selected Tier 2 SaaS limits", () => {
  const setup = normalizeOrganizationSetup({
    name: "Tier Two SaaS",
    orgType: "COM",
    serviceModel: "platform",
    licenseTier: "tier_2",
  });

  assert.deepEqual(setup.license, {
    tier: "tier_2",
    adminLimit: 3,
    userLimit: 20,
    propertyLimit: 75,
    adminSeatVersion: 0,
    capacityVersion: 0,
  });
  assert.throws(() => normalizeOrganizationSetup({
    name: "Invalid Tier",
    orgType: "COM",
    serviceModel: "platform",
    licenseTier: "tier_4",
  }), /license tier/);
  assert.throws(() => normalizeOrganizationSetup({
    name: "Invalid SaaS Fulfillment",
    orgType: "COM",
    serviceModel: "platform",
    defaultFulfillmentSource: "afterlight_staff",
  }), /Boutique, Managed Service, and Hybrid/);
});

test("organization setup provisions Boutique without a tier and with Afterlight fulfillment", () => {
  const setup = normalizeOrganizationSetup({
    name: "Small Property Group",
    orgType: "COM",
    serviceModel: "boutique",
    licenseTier: "tier_3",
  });

  assert.equal(setup.serviceModel, "boutique");
  assert.deepEqual(setup.license, {
    tier: null,
    adminLimit: 1,
    userLimit: 2,
    propertyLimit: 3,
    adminSeatVersion: 0,
    capacityVersion: 0,
  });
  assert.equal(setup.fulfillmentPolicy.defaultSource, "afterlight_staff");
  assert.throws(() => normalizeOrganizationSetup({
    name: "Customer Fulfilled Boutique",
    orgType: "COM",
    serviceModel: "boutique",
    defaultFulfillmentSource: "customer_employee",
  }), /Boutique|Afterlight fulfillment/i);
  assert.throws(() => normalizeOrganizationSetup({
    name: "Residential Boutique",
    orgType: "RES",
    serviceModel: "boutique",
  }), (error) => error.status === 400
    && error.code === "BOUTIQUE_ORGANIZATION_TYPE_NOT_ELIGIBLE");
});

test("organization name matching is exact and case insensitive", () => {
  const matcher = caseInsensitiveExact("A+B Properties");
  assert.equal(matcher.test("a+b properties"), true);
  assert.equal(matcher.test("AAB Properties"), false);
  assert.equal(matcher.test("A+B Properties West"), false);
});
