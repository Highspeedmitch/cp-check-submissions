const test = require("node:test");
const assert = require("node:assert/strict");
const {
  APPLY_CONFIRMATION,
  parseArguments,
  requireProductionApplyApproval,
} = require("../scripts/configureProductionOrganizations");
const {
  buildProductionOrganizationPlan,
  configureProductionOrganizations,
} = require("../services/productionOrganizationConfiguration");

const CONFIGURATION = {
  name: "Picor",
  serviceModel: "managed",
  defaultFulfillmentSource: "afterlight_staff",
  clearPropertyFulfillmentOverrides: true,
};

test("production organization configuration defaults to dry run", () => {
  assert.deepEqual(parseArguments([]), { apply: false });
  assert.throws(() => parseArguments(["--unknown"]), /Unsupported arguments/);
  assert.doesNotThrow(() => requireProductionApplyApproval({ apply: false, env: {} }));
});

test("applying production organization configuration requires two explicit guards", () => {
  assert.throws(
    () => requireProductionApplyApproval({ apply: true, env: {} }),
    /NODE_ENV=production/
  );
  assert.throws(
    () => requireProductionApplyApproval({ apply: true, env: { NODE_ENV: "production" } }),
    /CONFIRM_PRODUCTION_ORGANIZATION_CONFIGURATION/
  );
  assert.doesNotThrow(() => requireProductionApplyApproval({
    apply: true,
    env: {
      NODE_ENV: "production",
      CONFIRM_PRODUCTION_ORGANIZATION_CONFIGURATION: APPLY_CONFIRMATION,
    },
  }));
});

test("Picor managed-service plan clears overrides and increments the policy version", () => {
  const plan = buildProductionOrganizationPlan({
    _id: "org-1",
    name: "PICOR",
    serviceModel: "platform",
    fulfillmentPolicy: { defaultSource: "customer_employee", version: 3 },
    properties: [
      { fulfillmentPolicy: { defaultSource: "customer_contractor" } },
      { fulfillmentPolicy: { defaultSource: null } },
    ],
  }, CONFIGURATION);

  assert.equal(plan.status, "update");
  assert.equal(plan.clearedPropertyOverrides, 1);
  assert.deepEqual(plan.next, {
    serviceModel: "managed",
    defaultFulfillmentSource: "afterlight_staff",
    policyVersion: 4,
  });
});

test("dry run reads configuration without saving or creating audits", async () => {
  let saves = 0;
  let audits = 0;
  const organization = {
    _id: "org-1",
    name: "Picor",
    serviceModel: "platform",
    fulfillmentPolicy: { defaultSource: "customer_employee", version: 1 },
    properties: [],
    save: async () => { saves += 1; },
  };
  const plans = await configureProductionOrganizations({
    configurations: [CONFIGURATION],
    actorUserId: "admin-1",
    apply: false,
    OrganizationModel: { findOne: async () => organization },
    FulfillmentAuditModel: { create: async () => { audits += 1; } },
    PlatformAuditModel: { create: async () => { audits += 1; } },
  });

  assert.equal(plans[0].status, "update");
  assert.equal(saves, 0);
  assert.equal(audits, 0);
});

test("apply updates the organization and writes both audit records", async () => {
  const audits = [];
  const property = { fulfillmentPolicy: { defaultSource: "customer_contractor" } };
  const organization = {
    _id: "org-1",
    name: "Picor",
    serviceModel: "hybrid",
    fulfillmentPolicy: { defaultSource: "customer_employee", version: 5 },
    properties: [property],
    save: async () => {},
  };
  await configureProductionOrganizations({
    configurations: [CONFIGURATION],
    actorUserId: "admin-1",
    apply: true,
    OrganizationModel: { findOne: async () => organization },
    FulfillmentAuditModel: { create: async (audit) => { audits.push(audit); } },
    PlatformAuditModel: { create: async (audit) => { audits.push(audit); } },
    now: () => new Date("2026-08-04T12:00:00.000Z"),
  });

  assert.equal(organization.serviceModel, "managed");
  assert.equal(organization.fulfillmentPolicy.defaultSource, "afterlight_staff");
  assert.equal(organization.fulfillmentPolicy.version, 6);
  assert.equal(property.fulfillmentPolicy.defaultSource, null);
  assert.equal(audits.length, 2);
  assert.equal(audits[0].action, "production_organization_configured");
  assert.equal(audits[1].action, "production_organization_configured");
});

test("a missing organization fails before any production write", async () => {
  await assert.rejects(configureProductionOrganizations({
    configurations: [CONFIGURATION],
    actorUserId: "admin-1",
    apply: true,
    OrganizationModel: { findOne: async () => null },
    FulfillmentAuditModel: { create: async () => assert.fail("unexpected audit") },
    PlatformAuditModel: { create: async () => assert.fail("unexpected audit") },
  }), /Production organizations not found: Picor/);
});
