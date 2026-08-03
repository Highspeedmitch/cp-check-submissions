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
  currentServiceModel: "platform",
  requestedServiceModel: "hybrid",
  proposedEffectiveDate: "2026-09-01T00:00:00.000Z",
  reason: "We need overflow coverage.",
  status: "pending_review",
  organizationSnapshot: {
    propertyCount: 5,
    propertyOverrideCount: 1,
    defaultFulfillmentSource: "customer_employee",
    policyVersion: 3,
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
    "Current model: Full-stack SaaS",
    "Requested model: Hybrid",
    "Proposed effective date: 9/1/2026",
    "Properties: 5",
    "Property fulfillment overrides: 1",
    "Current default fulfillment: customer_employee",
    "Policy version: 3",
    "Reason: We need overflow coverage.",
    "Request ID: request-1",
  ]) {
    assert.match(email.text, new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
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
