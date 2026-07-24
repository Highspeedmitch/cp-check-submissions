const test = require("node:test");
const assert = require("node:assert/strict");
const { managedProperties, canAccessProperty } = require("../services/propertyAccess");

const properties = [
  { name: "Managed", propertyManagers: [{ toString: () => "pm-1" }] },
  { name: "Other", propertyManagers: [] },
];

test("property managers only receive explicitly assigned properties", () => {
  const result = managedProperties({ properties }, { role: "property_manager", userId: "pm-1" });
  assert.deepEqual(result.map((property) => property.name), ["Managed"]);
  assert.equal(canAccessProperty(properties[0], { role: "property_manager", userId: "pm-1" }), true);
  assert.equal(canAccessProperty(properties[1], { role: "property_manager", userId: "pm-1" }), false);
});

test("organization admins retain full property scope", () => {
  assert.equal(managedProperties({ properties }, { role: "admin", userId: "admin" }).length, 2);
});
