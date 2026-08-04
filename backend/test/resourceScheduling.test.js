const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveAssignmentAssignee,
  deployedSchedulerResources,
} = require("../services/resourceScheduling");

function leanResult(value) {
  return { async lean() { return value; } };
}

test("Afterlight contractor assignments require an active deployment and snapshot its rate", async () => {
  let deploymentQuery;
  const result = await resolveAssignmentAssignee({
    fulfillment: { source: "afterlight_contractor" },
    userId: "resource-user-1",
    organizationId: "org-1",
    property: { _id: "property-1" },
    startDate: "2026-08-10T17:00:00.000Z",
    ResourceProfileModel: {
      findOne(query) {
        assert.deepEqual(query, {
          userId: "resource-user-1",
          status: "active",
          availabilityStatus: "available",
          archivedAt: null,
        });
        return leanResult({
          _id: "resource-1",
          userId: "resource-user-1",
          defaultRateCents: 4500,
          currency: "USD",
        });
      },
    },
    ResourceDeploymentModel: {
      findOne(query) {
        deploymentQuery = query;
        return leanResult({ _id: "deployment-1", rateOverrideCents: 6250 });
      },
    },
  });

  assert.equal(deploymentQuery.organizationId, "org-1");
  assert.equal(deploymentQuery.resourceProfileId, "resource-1");
  assert.deepEqual(deploymentQuery.$and[1], {
    $or: [{ propertyIds: { $size: 0 } }, { propertyIds: "property-1" }],
  });
  assert.equal(result.userId, "resource-user-1");
  assert.equal(result.resourceProfileId, "resource-1");
  assert.equal(result.resourceDeploymentId, "deployment-1");
  assert.deepEqual({
    payeeType: result.compensationSnapshot.payeeType,
    rateType: result.compensationSnapshot.rateType,
    amountCents: result.compensationSnapshot.amountCents,
    currency: result.compensationSnapshot.currency,
  }, {
    payeeType: "afterlight_contractor",
    rateType: "per_assignment",
    amountCents: 6250,
    currency: "USD",
  });
  assert.ok(result.compensationSnapshot.snapshottedAt instanceof Date);
});

test("Afterlight contractors cannot be assigned outside an active deployment", async () => {
  await assert.rejects(resolveAssignmentAssignee({
    fulfillment: { source: "afterlight_contractor" },
    userId: "resource-user-1",
    organizationId: "org-1",
    property: { _id: "property-1" },
    startDate: "2026-08-10T17:00:00.000Z",
    ResourceProfileModel: {
      findOne: () => leanResult({ _id: "resource-1", userId: "resource-user-1", defaultRateCents: 4500 }),
    },
    ResourceDeploymentModel: { findOne: () => leanResult(null) },
  }), (error) => error.status === 400 && /not deployed/.test(error.message));
});

test("organization workers remain tenant-local and have no contractor pay snapshot", async () => {
  let userQuery;
  const result = await resolveAssignmentAssignee({
    fulfillment: { source: "customer_employee" },
    userId: "user-1",
    organizationId: "org-1",
    property: { _id: "property-1" },
    startDate: "2026-08-10T17:00:00.000Z",
    UserModel: {
      findOne(query) {
        userQuery = query;
        return { select: () => leanResult({ _id: "user-1" }) };
      },
    },
  });

  assert.equal(userQuery.organizationId, "org-1");
  assert.deepEqual(userQuery.accountScope, { $ne: "afterlight_resource" });
  assert.equal(result.resourceProfileId, null);
  assert.equal(result.compensationSnapshot, undefined);
});

test("scheduler resources expose deployment property scope and effective rate", async () => {
  const resources = await deployedSchedulerResources({
    organizationId: "org-1",
    ResourceDeploymentModel: {
      find: () => leanResult([{
        _id: "deployment-1",
        resourceProfileId: "resource-1",
        propertyIds: ["property-1"],
        rateOverrideCents: 7000,
      }]),
    },
    ResourceProfileModel: {
      find: () => ({
        select: () => leanResult([{
          _id: "resource-1",
          userId: "resource-user-1",
          email: "resource@example.com",
          displayName: "Riley Resource",
          defaultRateCents: 5000,
          currency: "USD",
        }]),
      }),
    },
  });

  assert.deepEqual(resources, [{
    _id: "resource-user-1",
    email: "resource@example.com",
    displayName: "Riley Resource",
    role: "contractor",
    accountScope: "afterlight_resource",
    resourceType: "contractor",
    resourceProfileId: "resource-1",
    resourceDeploymentId: "deployment-1",
    propertyIds: ["property-1"],
    rateCents: 7000,
    currency: "USD",
  }]);
});

test("Afterlight staff assignments require a deployed employee or owner without contractor pay", async () => {
  const result = await resolveAssignmentAssignee({
    fulfillment: { source: "afterlight_staff" },
    userId: "owner-user-1",
    organizationId: "org-1",
    property: { _id: "property-1" },
    startDate: "2026-08-10T17:00:00.000Z",
    ResourceProfileModel: {
      findOne: () => leanResult({
        _id: "resource-owner-1",
        userId: "owner-user-1",
        resourceType: "owner",
        defaultRateCents: 0,
      }),
    },
    ResourceDeploymentModel: {
      findOne: () => leanResult({ _id: "deployment-owner-1", rateOverrideCents: null }),
    },
  });

  assert.equal(result.resourceProfileId, "resource-owner-1");
  assert.equal(result.resourceDeploymentId, "deployment-owner-1");
  assert.equal(result.compensationSnapshot, undefined);
});
