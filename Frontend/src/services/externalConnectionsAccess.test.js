import {
  ASSIGNABLE_ORGANIZATION_ROLES,
  canAccessExternalConnections,
} from "./externalConnectionsAccess";

test.each(ASSIGNABLE_ORGANIZATION_ROLES)(
  "%s organization users can access external connections",
  (role) => {
    expect(canAccessExternalConnections({ role, accountScope: "organization" })).toBe(true);
  }
);

test.each(["admin", "property_manager", "client"])(
  "%s organization users cannot access external connections",
  (role) => {
    expect(canAccessExternalConnections({ role, accountScope: "organization" })).toBe(false);
  }
);

test("all Afterlight resource workspace identities can access external connections", () => {
  expect(canAccessExternalConnections({
    role: "admin",
    accountScope: "afterlight_resource",
  })).toBe(true);
});
