const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deliverPlatformRequestEmail,
  deliverRequesterDecisionEmail,
  platformAdminEmails,
} = require("../services/serviceModelChangeEmails");

function userModelWithEmails(emails) {
  return {
    find(query) {
      assert.deepEqual(query, {
        platformRole: "platform_admin",
        accountStatus: { $ne: "inactive" },
      });
      return {
        select(fields) {
          assert.equal(fields, "email");
          return {
            async lean() {
              return emails.map((email) => ({ email }));
            },
          };
        },
      };
    },
  };
}

const request = {
  _id: "request-1",
  changeType: "service_model",
  currentServiceModel: "platform",
  requestedServiceModel: "hybrid",
  currentLicenseTier: "tier_1",
  requestedLicenseTier: "tier_1",
  proposedEffectiveDate: "2026-09-01T00:00:00.000Z",
  reason: "We need overflow coverage.",
  status: "pending_review",
  organizationSnapshot: {
    propertyCount: 5,
    propertyOverrideCount: 1,
    defaultFulfillmentSource: "customer_employee",
    policyVersion: 3,
    activeAdministratorCount: 2,
    pendingAdministratorCount: 0,
    activeUserCount: 4,
    pendingUserCount: 1,
  },
  messages: [{ actorScope: "organization_admin", message: "We need overflow coverage." }],
};

test("platform administrator recipients are active, normalized, and unique", async () => {
  const recipients = await platformAdminEmails(userModelWithEmails([
    "Dev@AfterlightInspections.com",
    "dev@afterlightinspections.com",
    "platform@example.com",
  ]));
  assert.deepEqual(recipients, ["dev@afterlightinspections.com", "platform@example.com"]);
});

test("the platform request email contains the relevant contract and organization details", async () => {
  let email;
  const recipients = await deliverPlatformRequestEmail({
    request,
    organization: { name: "Picor" },
    requester: { email: "admin@picor.example" },
    UserModel: userModelWithEmails(["dev@afterlightinspections.com"]),
    sendEmail: async (message) => { email = message; },
  });

  assert.deepEqual(recipients, ["dev@afterlightinspections.com"]);
  assert.deepEqual(email.to, ["dev@afterlightinspections.com"]);
  assert.equal(email.subject, "Service model change requested: Picor");
  for (const detail of [
    "admin@picor.example",
    "Current plan: Full-stack SaaS Tier 1",
    "Requested plan: Hybrid Tier 1",
    "Proposed effective date: 9/1/2026",
    "Properties: 5",
    "Customer users: 5",
    "Organization administrators: 2",
    "Property fulfillment overrides: 1",
    "Current default fulfillment: customer_employee",
    "Policy version: 3",
    "Reason: We need overflow coverage.",
    "Request ID: request-1",
  ]) {
    assert.match(email.text, new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("license tier request emails identify the plan increase", async () => {
  let email;
  await deliverPlatformRequestEmail({
    request: {
      ...request,
      changeType: "license_tier",
      currentServiceModel: "hybrid",
      requestedServiceModel: "hybrid",
      requestedLicenseTier: "tier_2",
      organizationSnapshot: {
        ...request.organizationSnapshot,
        currentAfterlightPortfolioMinimumPercent: 15,
        requestedAfterlightPortfolioMinimumPercent: 12,
      },
    },
    organization: { name: "Picor" },
    requester: { email: "admin@picor.example" },
    UserModel: userModelWithEmails(["dev@afterlightinspections.com"]),
    sendEmail: async (message) => { email = message; },
  });

  assert.equal(email.subject, "License tier increase requested: Picor");
  assert.match(email.text, /requested a license tier increase/);
  assert.match(email.text, /Current plan: Hybrid Tier 1/);
  assert.match(email.text, /Requested plan: Hybrid Tier 2/);
  assert.match(email.text, /Afterlight portfolio minimum: 15% -> 12%/);
});

test("custom capacity request emails identify the administrator-seat increase", async () => {
  let email;
  await deliverPlatformRequestEmail({
    request: {
      ...request,
      changeType: "custom_capacity",
      currentServiceModel: "platform",
      requestedServiceModel: "platform",
      currentLicenseTier: "tier_3",
      requestedLicenseTier: "tier_3",
      organizationSnapshot: {
        ...request.organizationSnapshot,
        currentAdminLimit: 5,
        requestedAdminLimit: 8,
      },
    },
    organization: { name: "Picor" },
    requester: { email: "admin@picor.example" },
    UserModel: userModelWithEmails(["dev@afterlightinspections.com"]),
    sendEmail: async (message) => { email = message; },
  });

  assert.equal(email.subject, "Administrator capacity increase requested: Picor");
  assert.match(email.text, /requested a custom administrator capacity increase/);
  assert.match(email.text, /Current plan: Full-stack SaaS Tier 3 \(5 administrator seats\)/);
  assert.match(email.text, /Requested plan: Full-stack SaaS Tier 3 \(8 administrator seats\)/);
});

test("supplemental organization information is included when the request returns for review", async () => {
  let email;
  await deliverPlatformRequestEmail({
    request: {
      ...request,
      messages: [
        ...request.messages,
        { actorScope: "platform_admin", message: "Which properties are affected?" },
        { actorScope: "organization_admin", message: "All five Tucson properties." },
      ],
    },
    organization: { name: "Picor" },
    requester: { email: "admin@picor.example" },
    UserModel: userModelWithEmails(["dev@afterlightinspections.com"]),
    sendEmail: async (message) => { email = message; },
  });
  assert.match(email.text, /Latest organization update: All five Tucson properties\./);
});

test("the requester decision email includes the platform response and return route", async () => {
  let email;
  await deliverRequesterDecisionEmail({
    request: {
      ...request,
      status: "information_requested",
      platformResponse: "Which properties are affected?",
    },
    organization: { name: "Picor" },
    requester: { email: "admin@picor.example" },
    sendEmail: async (message) => { email = message; },
  });
  assert.equal(email.to, "admin@picor.example");
  assert.match(email.subject, /returned for more information/);
  assert.match(email.text, /Platform response: Which properties are affected\?/);
  assert.match(email.text, /service-delivery/);
});
