const test = require("node:test");
const assert = require("node:assert/strict");
const {
  availableWorkspaces,
  workspaceAuthentication,
} = require("../services/workspaceAccess");

function resourceLookup(profile) {
  return {
    findOne: () => ({
      select: () => ({ lean: async () => profile }),
    }),
  };
}

test("an organization user with a resource profile can enter both workspaces", async () => {
  const user = { _id: "user-1", accountScope: "organization" };
  assert.deepEqual(
    await availableWorkspaces(user, resourceLookup({ _id: "resource-1" })),
    ["organization", "afterlight_resource"]
  );
  assert.deepEqual(
    await workspaceAuthentication(user, "afterlight_resource", resourceLookup({ _id: "resource-1" })),
    {
      accountScope: "afterlight_resource",
      availableWorkspaces: ["organization", "afterlight_resource"],
    }
  );
});

test("a resource-only identity cannot switch into an organization", async () => {
  const user = { _id: "user-1", accountScope: "afterlight_resource" };
  await assert.rejects(
    workspaceAuthentication(user, "organization", resourceLookup({ _id: "resource-1" })),
    (error) => error.status === 403 && /not available/.test(error.message)
  );
});

test("a normal organization user cannot enter the resource workspace", async () => {
  const user = { _id: "user-1", accountScope: "organization" };
  await assert.rejects(
    workspaceAuthentication(user, "afterlight_resource", resourceLookup(null)),
    (error) => error.status === 403 && /not available/.test(error.message)
  );
});

test("an archived organization presence does not remove a dual user's resource workspace", async () => {
  const user = {
    _id: "user-1",
    accountScope: "organization",
    organizationArchivedAt: new Date("2026-08-04T12:00:00Z"),
  };
  assert.deepEqual(
    await availableWorkspaces(user, resourceLookup({ _id: "resource-1" })),
    ["afterlight_resource"]
  );
  assert.deepEqual(
    await workspaceAuthentication(user, undefined, resourceLookup({ _id: "resource-1" })),
    {
      accountScope: "afterlight_resource",
      availableWorkspaces: ["afterlight_resource"],
    }
  );
});
