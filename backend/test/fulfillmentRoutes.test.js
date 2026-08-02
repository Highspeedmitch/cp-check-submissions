const test = require("node:test");
const assert = require("node:assert/strict");
const { createFulfillmentHandlers } = require("../Routes/fulfillment");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function organization() {
  return {
    _id: "org-1",
    name: "Example Organization",
    serviceModel: "managed",
    fulfillmentPolicy: {
      defaultSource: "afterlight_staff",
      version: 2,
    },
    properties: [],
    saveCount: 0,
    async save() {
      this.saveCount += 1;
    },
  };
}

function request(body) {
  return {
    user: { role: "admin", userId: "admin-1", organizationId: "org-1" },
    body,
    ip: "127.0.0.1",
    get: () => "test-agent",
  };
}

test("organization fulfillment changes reject missing or invalid admin grants", async () => {
  const org = organization();
  let grantRequest;
  const handlers = createFulfillmentHandlers({
    OrganizationModel: { async findById() { return org; } },
    consumeAdminGrant: async (details) => {
      grantRequest = details;
      return false;
    },
    FulfillmentAuditModel: {
      async create() {
        assert.fail("an unverified policy change must not be audited");
      },
    },
  });
  const res = response();

  await handlers.updateOrganization(request({
    serviceModel: "hybrid",
    defaultSource: "customer_employee",
  }), res);

  assert.equal(res.statusCode, 403);
  assert.equal(org.saveCount, 0);
  assert.equal(org.serviceModel, "managed");
  assert.equal(grantRequest.organization, org);
  assert.equal(grantRequest.userId, "admin-1");
  assert.equal(grantRequest.purpose, "update_fulfillment_policy");
  assert.equal(grantRequest.token, undefined);
});

test("a scoped admin grant is consumed before the organization policy changes", async () => {
  const org = organization();
  let grantRequest;
  let auditEntry;
  const handlers = createFulfillmentHandlers({
    OrganizationModel: { async findById() { return org; } },
    consumeAdminGrant: async (details) => {
      grantRequest = details;
      return true;
    },
    FulfillmentAuditModel: {
      async create(entry) {
        auditEntry = entry;
      },
    },
  });
  const res = response();

  await handlers.updateOrganization(request({
    serviceModel: "hybrid",
    defaultSource: "afterlight_contractor",
    adminActionGrant: "one-time-grant",
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(grantRequest.purpose, "update_fulfillment_policy");
  assert.equal(grantRequest.token, "one-time-grant");
  assert.equal(org.saveCount, 1);
  assert.equal(org.serviceModel, "hybrid");
  assert.equal(org.fulfillmentPolicy.defaultSource, "afterlight_contractor");
  assert.equal(org.fulfillmentPolicy.version, 3);
  assert.equal(auditEntry.action, "organization_fulfillment_policy_updated");
  assert.equal(auditEntry.nextValue.policyVersion, 3);
});

test("saving an unchanged organization policy remains a harmless no-op", async () => {
  const org = organization();
  const handlers = createFulfillmentHandlers({
    OrganizationModel: { async findById() { return org; } },
    consumeAdminGrant: async () => {
      assert.fail("a no-op must not consume an admin grant");
    },
  });
  const res = response();

  await handlers.updateOrganization(request({
    serviceModel: "managed",
    defaultSource: "afterlight_staff",
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(org.saveCount, 0);
  assert.equal(res.body.organization.policyVersion, 2);
});
