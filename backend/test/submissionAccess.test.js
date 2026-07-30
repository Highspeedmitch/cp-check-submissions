const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isManagementRole,
  buildSubmissionQuery,
} = require("../services/submissionAccess");

test("ordinary submission queries are limited to the authenticated submitter", async () => {
  const query = await buildSubmissionQuery({
    user: { role: "user", userId: "user-1", organizationId: "org-1" },
  });
  assert.deepEqual(query, {
    organizationId: "org-1",
    userId: "user-1",
  });
});

test("property-manager submission queries are limited to managed properties", async () => {
  const query = await buildSubmissionQuery({
    user: { role: "property_manager", userId: "pm-1", organizationId: "org-1" },
    OrganizationModel: {
      async findById() {
        return {
          properties: [
            {
              name: "Managed",
              propertyManagers: [{ toString: () => "pm-1" }],
            },
            { name: "Other", propertyManagers: [] },
          ],
        };
      },
    },
  });
  assert.deepEqual(query, {
    organizationId: "org-1",
    property: { $in: ["Managed"] },
  });
});

test("only administrators and property managers have management history access", () => {
  assert.equal(isManagementRole({ role: "admin" }), true);
  assert.equal(isManagementRole({ role: "property_manager" }), true);
  assert.equal(isManagementRole({ role: "user" }), false);
  assert.equal(isManagementRole({ role: "client" }), false);
});
