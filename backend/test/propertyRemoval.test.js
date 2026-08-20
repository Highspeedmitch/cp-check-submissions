const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_REFERENCE_MODELS,
  analyzePropertyRemoval,
  propertyRemovalErrorBody,
  removeProperty,
} = require("../services/propertyRemoval");

function property(overrides = {}) {
  return {
    _id: "property-1",
    name: "Campbell Fair | Fort Lowell & Glenn",
    propertyCode: "PA01",
    region: "Tucson",
    ...overrides,
  };
}

function organization(overrides = {}) {
  return {
    _id: "organization-1",
    properties: [property()],
    routes: [],
    security: { adminActionPasskeyVersion: 2 },
    ...overrides,
  };
}

function referenceModels(counts = {}) {
  return Object.fromEntries(Object.keys(DEFAULT_REFERENCE_MODELS).map((key) => [key, {
    async countDocuments() {
      return counts[key] || 0;
    },
  }]));
}

test("property removal preflight resolves immutable IDs and reports linked records", async () => {
  const impact = await analyzePropertyRemoval({
    organization: organization({
      routes: [{
        _id: "route-1",
        name: "Tucson North",
        status: "active",
        propertyIds: ["property-1", "property-2"],
      }],
    }),
    propertyIdentifier: "property-1",
    referenceModels: referenceModels({ assignments: 2, invoices: 1 }),
  });

  assert.equal(impact.property.name, "Campbell Fair | Fort Lowell & Glenn");
  assert.equal(impact.canRemove, false);
  assert.deepEqual(
    impact.blockers.map(({ code, count }) => ({ code, count })),
    [
      { code: "activeRoutes", count: 1 },
      { code: "assignments", count: 2 },
      { code: "invoices", count: 1 },
    ]
  );
  assert.deepEqual(impact.references.activeRouteNames, ["Tucson North"]);
});

test("property removal uses an atomic ID pull and records an audit in one transaction", async () => {
  const org = organization();
  const updates = [];
  const audits = [];
  const grants = [];
  const session = { id: "removal-session" };

  const result = await removeProperty({
    organizationId: org._id,
    propertyIdentifier: "property-1",
    actorUserId: "admin-1",
    adminActionGrant: "one-time-grant",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    OrganizationModel: {
      findById: async () => org,
      async updateOne(filter, update, options) {
        updates.push({ filter, update, options });
        return { modifiedCount: 1 };
      },
    },
    PlatformAuditModel: {
      async create(records, options) {
        audits.push({ records, options });
      },
    },
    referenceModels: referenceModels(),
    async consumeAdminGrant(details) {
      grants.push(details);
      return true;
    },
    transactionRunner: async (work) => work(session),
  });

  assert.equal(result.propertyName, "Campbell Fair | Fort Lowell & Glenn");
  assert.equal(grants[0].session, session);
  assert.deepEqual(updates[0], {
    filter: { _id: "organization-1", "properties._id": "property-1" },
    update: { $pull: { properties: { _id: "property-1" } } },
    options: { session },
  });
  assert.equal(audits[0].records[0].action, "organization_property_removed");
  assert.equal(audits[0].records[0].metadata.propertyCode, "PA01");
  assert.equal(audits[0].options.session, session);
});

test("property removal refuses to orphan linked records and returns structured impact", async () => {
  const org = organization();
  let updateAttempted = false;
  let auditAttempted = false;
  await assert.rejects(() => removeProperty({
    organizationId: org._id,
    propertyIdentifier: "property-1",
    actorUserId: "admin-1",
    adminActionGrant: "one-time-grant",
    OrganizationModel: {
      findById: async () => org,
      async updateOne() {
        updateAttempted = true;
        return { modifiedCount: 1 };
      },
    },
    PlatformAuditModel: {
      async create() { auditAttempted = true; },
    },
    referenceModels: referenceModels({ submissions: 4 }),
    consumeAdminGrant: async () => true,
    transactionRunner: async (work) => work({ id: "session" }),
  }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "PROPERTY_REMOVAL_BLOCKED");
    assert.equal(error.impact.blockers[0].code, "submissions");
    assert.equal(error.impact.blockers[0].count, 4);
    assert.deepEqual(propertyRemovalErrorBody(error), {
      error: "This property still has linked records. Resolve the listed dependencies before removing it.",
      code: "PROPERTY_REMOVAL_BLOCKED",
      impact: error.impact,
    });
    return true;
  });
  assert.equal(updateAttempted, false);
  assert.equal(auditAttempted, false);
});

test("property removal returns a specific verification error", async () => {
  const org = organization();
  await assert.rejects(() => removeProperty({
    organizationId: org._id,
    propertyIdentifier: "property-1",
    actorUserId: "admin-1",
    adminActionGrant: "expired-grant",
    OrganizationModel: { findById: async () => org },
    PlatformAuditModel: {},
    referenceModels: referenceModels(),
    consumeAdminGrant: async () => false,
    transactionRunner: async (work) => work({ id: "session" }),
  }), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.code, "ADMIN_GRANT_INVALID");
    assert.match(error.message, /Verify again/);
    return true;
  });
});
