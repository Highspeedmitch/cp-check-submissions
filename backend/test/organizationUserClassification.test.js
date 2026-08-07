const test = require("node:test");
const assert = require("node:assert/strict");
const {
  customerEngagementMatchesFulfillment,
  inferredCustomerEngagementType,
  normalizeOrganizationUserClassification,
} = require("../services/organizationUserClassification");

test("Field Operator input is stored as the user access role with explicit engagement", () => {
  assert.deepEqual(normalizeOrganizationUserClassification({
    role: "field_operator",
    engagementType: "customer_contractor",
  }), {
    role: "user",
    engagementType: "customer_contractor",
  });
});

test("legacy organization roles infer their existing customer engagement", () => {
  assert.equal(inferredCustomerEngagementType({ role: "user" }), "customer_employee");
  assert.equal(inferredCustomerEngagementType({ role: "contractor" }), "customer_contractor");
  assert.deepEqual(normalizeOrganizationUserClassification({ role: "contractor" }), {
    role: "user",
    engagementType: "customer_contractor",
  });
});

test("cleaners require an explicit assignment type", () => {
  assert.throws(
    () => normalizeOrganizationUserClassification({ role: "cleaner" }),
    /Customer Employee or Customer Contractor/,
  );
});

test("management roles can remain unavailable for scheduling", () => {
  assert.deepEqual(normalizeOrganizationUserClassification({ role: "property_manager" }), {
    role: "property_manager",
    engagementType: null,
  });
});

test("fulfillment matching uses explicit classification before legacy inference", () => {
  const contractor = { role: "user", engagementType: "customer_contractor" };
  assert.equal(customerEngagementMatchesFulfillment(contractor, "customer_contractor"), true);
  assert.equal(customerEngagementMatchesFulfillment(contractor, "customer_employee"), false);
});
