const test = require("node:test");
const assert = require("node:assert/strict");
const { updateResourceDeploymentScope } = require("../services/resourceDeployments");

function queryResult(value) {
  return { session: async () => value };
}

function transactionSession() {
  return {
    withTransaction: async (operation) => operation(),
    endSession: async () => {},
  };
}

test("deployment scope edits update future property eligibility in the same organization", async () => {
  let auditRecord;
  let createdDestination = false;
  const deployment = {
    _id: "deployment-1",
    resourceProfileId: "resource-1",
    organizationId: "org-1",
    propertyIds: ["property-1"],
    status: "active",
    rateOverrideCents: null,
    save: async () => {},
  };

  const result = await updateResourceDeploymentScope({
    deploymentId: "deployment-1",
    organizationId: "org-1",
    propertyIds: ["property-2"],
    rateOverrideCents: null,
    actorUserId: "admin-1",
    ResourceDeploymentModel: {
      findById: () => queryResult(deployment),
      findOne: () => queryResult(null),
      create: async () => { createdDestination = true; },
    },
    ResourceProfileModel: {
      findById: () => queryResult({ _id: "resource-1", resourceType: "owner", defaultRateCents: 0 }),
    },
    OrganizationModel: {
      findOne: () => queryResult({
        _id: "org-1",
        properties: [{ _id: "property-1" }, { _id: "property-2" }],
      }),
    },
    PlatformAuditModel: {
      create: async ([record]) => { auditRecord = record; },
    },
    startSession: async () => transactionSession(),
  });

  assert.equal(result.organizationChanged, false);
  assert.equal(result.deployment, deployment);
  assert.deepEqual(deployment.propertyIds, ["property-2"]);
  assert.equal(deployment.status, "active");
  assert.equal(deployment.updatedBy, "admin-1");
  assert.equal(createdDestination, false);
  assert.equal(auditRecord.action, "afterlight_resource_deployment_scope_updated");
  assert.equal(auditRecord.metadata.organizationChanged, false);
});

test("organization changes preserve the old deployment and create a destination deployment", async () => {
  let createdRecord;
  const source = {
    _id: "deployment-1",
    resourceProfileId: "resource-1",
    organizationId: "org-1",
    propertyIds: ["property-1"],
    status: "active",
    rateOverrideCents: null,
    save: async () => {},
  };
  const destination = { _id: "deployment-2" };

  const result = await updateResourceDeploymentScope({
    deploymentId: "deployment-1",
    organizationId: "org-2",
    propertyIds: ["property-2"],
    rateOverrideCents: null,
    actorUserId: "admin-1",
    ResourceDeploymentModel: {
      findById: () => queryResult(source),
      findOne: () => queryResult(null),
      create: async ([record]) => {
        createdRecord = record;
        return [destination];
      },
    },
    ResourceProfileModel: {
      findById: () => queryResult({ _id: "resource-1", resourceType: "owner", defaultRateCents: 0 }),
    },
    OrganizationModel: {
      findOne: () => queryResult({ _id: "org-2", properties: [{ _id: "property-2" }] }),
    },
    PlatformAuditModel: { create: async () => {} },
    startSession: async () => transactionSession(),
  });

  assert.equal(result.organizationChanged, true);
  assert.equal(result.deployment, destination);
  assert.equal(source.status, "ended");
  assert.ok(source.endsAt instanceof Date);
  assert.equal(source.updatedBy, "admin-1");
  assert.equal(createdRecord.organizationId, "org-2");
  assert.equal(createdRecord.resourceProfileId, "resource-1");
  assert.deepEqual(createdRecord.propertyIds, ["property-2"]);
  assert.equal(createdRecord.status, "active");
  assert.equal(createdRecord.rateOverrideCents, null);
});

test("organization changes reject a duplicate current destination deployment", async () => {
  const source = {
    _id: "deployment-1",
    resourceProfileId: "resource-1",
    organizationId: "org-1",
    status: "active",
    save: async () => {},
  };

  await assert.rejects(
    updateResourceDeploymentScope({
      deploymentId: "deployment-1",
      organizationId: "org-2",
      propertyIds: [],
      rateOverrideCents: null,
      actorUserId: "admin-1",
      ResourceDeploymentModel: {
        findById: () => queryResult(source),
        findOne: () => queryResult({ _id: "deployment-2", status: "paused" }),
      },
      ResourceProfileModel: {
        findById: () => queryResult({ _id: "resource-1", resourceType: "owner", defaultRateCents: 0 }),
      },
      OrganizationModel: {
        findOne: () => queryResult({ _id: "org-2", properties: [] }),
      },
      PlatformAuditModel: { create: async () => {} },
      startSession: async () => transactionSession(),
    }),
    (error) => error.status === 409 && /already has a current deployment/.test(error.message)
  );
  assert.equal(source.status, "active");
});
