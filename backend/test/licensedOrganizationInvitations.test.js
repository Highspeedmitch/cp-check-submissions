const test = require("node:test");
const assert = require("node:assert/strict");
const { createLicensedOrganizationInvitation } = require("../services/licensedOrganizationInvitations");

test("licensed manual activation reserves capacity and returns a setup link without sending email", async () => {
  const audits = [];
  let invitationArguments;
  let deliveryCalls = 0;
  const expiresAt = new Date("2026-08-25T12:00:00.000Z");
  const organization = {
    _id: "org-1",
    name: "PaulAshCRE",
    properties: [],
    routes: [],
  };

  const result = await createLicensedOrganizationInvitation({
    organizationId: organization._id,
    email: "Mike.Ash@example.com",
    role: "property_manager",
    engagementType: null,
    invitedBy: "admin-1",
    deliveryMethod: "manual",
    reserveCapacity: async ({ work }) => ({
      organization,
      value: await work({ organization, session: "session-1" }),
    }),
    createInvitationRecord: async (args) => {
      invitationArguments = args;
      return {
        invitation: {
          _id: "invitation-1",
          email: "mike.ash@example.com",
          role: "property_manager",
          deliveryMethod: "manual",
          expiresAt,
        },
        token: "manual-token-value-with-sufficient-entropy",
      };
    },
    deliverInvitationEmail: async () => { deliveryCalls += 1; },
    PlatformAuditModel: {
      create: async (records) => { audits.push(...records); },
    },
    capacityReader: async () => ({ users: { allocated: 2, remaining: 3 } }),
  });

  assert.equal(invitationArguments.deliveryMethod, "manual");
  assert.equal(invitationArguments.deliver, false);
  assert.equal(deliveryCalls, 0);
  assert.equal(result.delivered, null);
  assert.match(result.manualActivation.setupUrl, /\/join#manual-token-value-with-sufficient-entropy$/);
  assert.equal(result.manualActivation.expiresAt, expiresAt);
  assert.equal(result.capacity.users.remaining, 3);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "organization_invitation_created");
  assert.equal(audits[0].metadata.deliveryMethod, "manual");
});

test("licensed email setup preserves invitation delivery behavior", async () => {
  let deliveryCalls = 0;
  const organization = { _id: "org-1", name: "Example", properties: [], routes: [] };
  const result = await createLicensedOrganizationInvitation({
    organizationId: organization._id,
    email: "person@example.com",
    role: "user",
    engagementType: "customer_employee",
    invitedBy: "admin-1",
    reserveCapacity: async ({ work }) => ({
      organization,
      value: await work({ organization, session: "session-1" }),
    }),
    createInvitationRecord: async () => ({
      invitation: {
        _id: "invitation-1",
        email: "person@example.com",
        role: "user",
        deliveryMethod: "email",
        expiresAt: new Date("2026-08-25T12:00:00.000Z"),
      },
      token: "email-token-value",
    }),
    deliverInvitationEmail: async () => { deliveryCalls += 1; },
    PlatformAuditModel: { create: async () => {} },
    capacityReader: async () => ({ users: { allocated: 2 } }),
  });

  assert.equal(deliveryCalls, 1);
  assert.equal(result.delivered, true);
  assert.equal(result.manualActivation, null);
});
