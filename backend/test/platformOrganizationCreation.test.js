const test = require("node:test");
const assert = require("node:assert/strict");
const { createOrganizationHandler } = require("../Routes/platform");

function queryResult(value) {
  return {
    select() {
      return { lean: async () => value };
    },
  };
}

function responseRecorder() {
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

test("platform-managed organization creation skips the customer administrator invitation", async () => {
  let createdSetup;
  let audit;
  const handler = createOrganizationHandler({
    OrganizationModel: {
      findOne: () => queryResult(null),
      async create(setup) {
        createdSetup = setup;
        return {
          _id: "org-1",
          name: setup.name,
          orgType: setup.orgType,
          reportingTimezone: setup.reportingTimezone,
        };
      },
    },
    UserModel: {
      findOne() {
        assert.fail("no administrator identity lookup is needed");
      },
    },
    PlatformAuditModel: {
      async create(record) {
        audit = record;
      },
    },
    createOrganizationInvitation: async () => assert.fail("no invitation should be created"),
  });
  const req = {
    body: {
      name: "Ownerless Operations",
      orgType: "COM",
      administrationMode: "platform_managed",
    },
    user: { userId: "platform-1" },
    ip: "127.0.0.1",
    get: () => "test-agent",
  };
  const res = responseRecorder();

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.administrationMode, "platform_managed");
  assert.equal(res.body.initialAdminEmail, null);
  assert.equal(res.body.invitationDelivered, null);
  assert.equal(createdSetup.administration.mode, "platform_managed");
  assert.equal(createdSetup.administration.updatedBy, "platform-1");
  assert.equal(createdSetup.onboarding.status, "in_progress");
  assert.equal(audit.metadata.administrationMode, "platform_managed");
});
