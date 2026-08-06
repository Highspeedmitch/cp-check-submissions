const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertLicenseCapacity,
  summarizeLicenseCapacity,
  touchCapacityVersion,
} = require("../services/licenseCapacity");

test("summarizes administrator, user, and property capacity from one entitlement source", () => {
  const summary = summarizeLicenseCapacity({
    organization: {
      serviceModel: "platform",
      license: { tier: "tier_2" },
    },
    capacity: {
      activeAdministrators: 1,
      pendingAdministrators: 1,
      activeUsers: 8,
      pendingUsers: 2,
      properties: 12,
    },
  });

  assert.equal(summary.administrators.limit, 3);
  assert.equal(summary.administrators.remaining, 1);
  assert.equal(summary.users.limit, 20);
  assert.equal(summary.users.allocated, 10);
  assert.equal(summary.users.remaining, 10);
  assert.equal(summary.properties.limit, 50);
  assert.equal(summary.properties.remaining, 38);
});

test("managed service capacity is unmetered across every customer dimension", () => {
  const summary = summarizeLicenseCapacity({
    organization: { serviceModel: "managed" },
    capacity: { activeAdministrators: 20, activeUsers: 200, properties: 500 },
  });

  assert.equal(summary.administrators.unmetered, true);
  assert.equal(summary.users.unmetered, true);
  assert.equal(summary.properties.unmetered, true);
  assert.doesNotThrow(() => assertLicenseCapacity({ summary, dimension: "users", additional: 1000 }));
});

test("capacity enforcement returns a stable conflict code and the current capacity snapshot", () => {
  const summary = summarizeLicenseCapacity({
    organization: { serviceModel: "hybrid", license: { tier: "tier_1" } },
    capacity: { activeUsers: 4, pendingUsers: 1, properties: 10 },
  });

  assert.throws(
    () => assertLicenseCapacity({ summary, dimension: "users", additional: 1 }),
    (error) => error.status === 409
      && error.code === "USER_LIMIT_REACHED"
      && error.remaining === 0
      && error.capacity === summary
  );
  assert.throws(
    () => assertLicenseCapacity({ summary, dimension: "properties", additional: 1 }),
    (error) => error.code === "PROPERTY_LIMIT_REACHED"
  );
});

test("capacity version changes every reservation-bearing organization write", () => {
  const organization = { license: { capacityVersion: 3 } };
  const now = new Date("2026-08-06T12:00:00Z");
  assert.equal(touchCapacityVersion(organization, { actorUserId: "admin-1", now }), 4);
  assert.equal(organization.license.updatedBy, "admin-1");
  assert.equal(organization.license.updatedAt, now);
});
