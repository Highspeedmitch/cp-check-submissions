const test = require("node:test");
const assert = require("node:assert/strict");
const { assignedResourceContext } = require("../services/resourceAccess");

test("resource access follows an exact assignment across tenant boundaries", async () => {
  let assignmentQuery;
  const assignment = {
    _id: "assignment-1",
    userId: "resource-user-1",
    organizationId: "customer-org-1",
    propertyName: "Broadway Center",
  };
  const context = await assignedResourceContext({
    user: { accountScope: "afterlight_resource", userId: "resource-user-1", organizationId: "workforce-org" },
    assignmentId: "assignment-1",
    propertyName: "Broadway Center",
    AssignmentModel: {
      async findOne(query) {
        assignmentQuery = query;
        return assignment;
      },
    },
    OrganizationModel: {
      async findById(id) {
        assert.equal(id, "customer-org-1");
        return { _id: id, properties: [{ _id: "property-1", name: "Broadway Center" }] };
      },
    },
  });

  assert.equal(assignmentQuery.userId, "resource-user-1");
  assert.equal(assignmentQuery.status, "scheduled");
  assert.equal(assignmentQuery["fulfillment.source"], "afterlight_contractor");
  assert.equal(context.assignment, assignment);
  assert.equal(context.property._id, "property-1");
});

test("resource access rejects a property that does not match the assignment", async () => {
  await assert.rejects(assignedResourceContext({
    user: { accountScope: "afterlight_resource", userId: "resource-user-1" },
    assignmentId: "assignment-1",
    propertyName: "Different Property",
    AssignmentModel: {
      async findOne() {
        return { organizationId: "org-1", propertyName: "Broadway Center" };
      },
    },
  }), (error) => error.status === 403 && /does not match/.test(error.message));
});

test("ordinary organization users do not receive cross-tenant resource context", async () => {
  const context = await assignedResourceContext({
    user: { accountScope: "organization", userId: "user-1" },
    assignmentId: "assignment-1",
  });
  assert.equal(context, null);
});
