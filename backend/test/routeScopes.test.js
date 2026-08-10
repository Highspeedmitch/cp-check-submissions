const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deploymentScopeMode,
  effectivePropertyIdsForDeployment,
  effectivePropertyIdsForUser,
  eligibleRouteIdsForUser,
  validateRouteDefinition,
} = require("../services/routeScopes");

function organization() {
  return {
    properties: [
      { _id: "p1", name: "One", region: "Tucson East", fieldOperators: [] },
      { _id: "p2", name: "Two", region: "Tucson East", fieldOperators: [] },
      { _id: "p3", name: "Three", region: "Tucson East", fieldOperators: [] },
      { _id: "p4", name: "West", region: "Tucson West", fieldOperators: [] },
    ],
    routes: [{
      _id: "route-1",
      name: "East route",
      region: "Tucson East",
      propertyIds: ["p1", "p2"],
      assignedUserIds: ["user-1"],
      status: "active",
    }],
    workScopeConfiguredUsers: ["user-1", "user-2"],
  };
}

test("a direct route assignment grants every current stop and follows future edits", () => {
  const org = organization();
  const user = { _id: "user-1", role: "user" };

  assert.deepEqual(
    effectivePropertyIdsForUser(org, user).sort(),
    ["p1", "p2"]
  );

  org.routes[0].propertyIds = ["p2", "p3"];
  assert.deepEqual(
    effectivePropertyIdsForUser(org, user).sort(),
    ["p2", "p3"]
  );
});

test("individual access to every stop automatically makes a user route eligible", () => {
  const org = organization();
  org.properties[0].fieldOperators = ["user-2"];
  org.properties[1].fieldOperators = ["user-2"];

  assert.deepEqual(
    eligibleRouteIdsForUser(org, { _id: "user-2", role: "user" }),
    ["route-1"]
  );
});

test("route definitions enforce named regions, same-region membership, and the six-stop cap", () => {
  const org = organization();
  assert.throws(() => validateRouteDefinition(org, {
    name: "Mixed",
    region: "Tucson East",
    propertyIds: ["p1", "p4"],
  }), /selected region/i);
  assert.throws(() => validateRouteDefinition(org, {
    name: "Uncategorized route",
    region: "Uncategorized",
    propertyIds: ["p1", "p2"],
  }), /named region/i);

  const oversized = {
    properties: Array.from({ length: 7 }, (_, index) => ({
      _id: `p${index}`,
      name: `Property ${index}`,
      region: "Tucson East",
    })),
    routes: [],
  };
  assert.throws(() => validateRouteDefinition(oversized, {
    name: "Too large",
    region: "Tucson East",
    propertyIds: oversized.properties.map((property) => property._id),
  }), /between 2 and 6/i);
});

test("resource deployment scopes combine direct properties and dynamically routed properties", () => {
  const org = organization();
  assert.deepEqual(
    effectivePropertyIdsForDeployment(org, {
      scopeMode: "selected",
      propertyIds: ["p4"],
      routeIds: ["route-1"],
    }).sort(),
    ["p1", "p2", "p4"]
  );
  assert.deepEqual(
    effectivePropertyIdsForDeployment(org, { scopeMode: "all" }).sort(),
    ["p1", "p2", "p3", "p4"]
  );
  assert.equal(deploymentScopeMode({ routeIds: ["route-1"] }), "selected");
  assert.deepEqual(
    effectivePropertyIdsForDeployment(org, { routeIds: ["route-1"] }).sort(),
    ["p1", "p2"]
  );
});
