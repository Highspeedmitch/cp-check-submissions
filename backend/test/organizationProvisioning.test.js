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

test("organization name matching is exact and case insensitive", () => {
  const matcher = caseInsensitiveExact("A+B Properties");
  assert.equal(matcher.test("a+b properties"), true);
  assert.equal(matcher.test("AAB Properties"), false);
  assert.equal(matcher.test("A+B Properties West"), false);
});
