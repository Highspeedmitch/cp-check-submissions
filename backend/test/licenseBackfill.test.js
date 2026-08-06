const test = require("node:test");
const assert = require("node:assert/strict");
const { planOrganizationLicenseBackfill } = require("../services/licenseBackfill");

test("license backfill assigns Tier 1 defaults to existing SaaS organizations", () => {
  const plan = planOrganizationLicenseBackfill({
    _id: "org-1",
    name: "Example SaaS",
    serviceModel: "platform",
  });
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.next, {
    tier: "tier_1",
    adminLimit: 2,
    userLimit: 5,
    propertyLimit: 10,
    adminSeatVersion: 0,
    capacityVersion: 0,
  });
});

test("license backfill keeps managed organizations unmetered", () => {
  const plan = planOrganizationLicenseBackfill({
    _id: "org-2",
    name: "Managed Customer",
    serviceModel: "managed",
  });
  assert.equal(plan.next.tier, null);
  assert.equal(plan.next.adminLimit, null);
  assert.equal(plan.next.userLimit, null);
  assert.equal(plan.next.propertyLimit, null);
});
