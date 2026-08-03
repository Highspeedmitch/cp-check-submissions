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

test("organization administrators cannot directly change their contracted service model", async () => {
  const org = organization();
  const handlers = createFulfillmentHandlers({
    OrganizationModel: { async findById() { return org; } },
    consumeAdminGrant: async () => assert.fail("a contract request must not consume an organization grant"),
  });
  const res = response();

  await handlers.updateOrganization(request({
    serviceModel: "hybrid",
    defaultSource: "customer_employee",
    adminActionGrant: "organization-controlled-grant",
  }), res);

  assert.equal(res.statusCode, 403);
  assert.equal(org.saveCount, 0);
  assert.equal(org.serviceModel, "managed");
  assert.match(res.body.error, /service model change request/i);
});

test("a scoped admin grant still protects operational fulfillment-default changes", async () => {
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
    serviceModel: "managed",
    defaultSource: "afterlight_contractor",
    adminActionGrant: "one-time-grant",
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(grantRequest.purpose, "update_fulfillment_policy");
  assert.equal(grantRequest.token, "one-time-grant");
  assert.equal(org.saveCount, 1);
  assert.equal(org.serviceModel, "managed");
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
