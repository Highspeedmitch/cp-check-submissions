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

test("client property access is limited to explicit ownership", () => {
  const clientProperties = [
    { name: "Owned", clientOwners: [{ toString: () => "client-1" }] },
    { name: "Other", clientOwners: [] },
  ];
  const user = { role: "client", userId: "client-1" };

  assert.deepEqual(
    managedProperties({ properties: clientProperties }, user).map((property) => property.name),
    ["Owned"]
  );
  assert.equal(canAccessProperty(clientProperties[0], user), true);
  assert.equal(canAccessProperty(clientProperties[1], user), false);
});

test("unknown roles receive no property access by default", () => {
  const user = { role: "unexpected", userId: "user-1" };
  assert.deepEqual(managedProperties({ properties }, user), []);
  assert.equal(canAccessProperty(properties[0], user), false);
});

test("operational users cannot access unassigned properties", () => {
  const assigned = {
    name: "Assigned",
    propertyManagers: [{ toString: () => "pm-1" }],
  };
  const unassigned = { name: "Unassigned", propertyManagers: [] };
  const user = { role: "user", userId: "user-1" };

  assert.deepEqual(
    managedProperties({ properties: [assigned, unassigned] }, user)
      .map((property) => property.name),
    ["Assigned"]
  );
  assert.equal(canAccessProperty(assigned, user), true);
  assert.equal(canAccessProperty(unassigned, user), false);
});
