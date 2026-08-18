const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeInvitationEmail,
  invitationToken,
  hashInvitationToken,
  invitationUrl,
  invitationRoleLabel,
  normalizeInvitationDeliveryMethod,
  createInvitation,
  resendInvitation,
  createManualActivation,
} = require("../services/organizationInvitations");

test("invitation emails are normalized and validated", () => {
  assert.equal(normalizeInvitationEmail("  Admin@Example.COM "), "admin@example.com");
  assert.throws(() => normalizeInvitationEmail("not-an-email"), /valid invitation email/);
});

test("invitation role labels distinguish customer Field Operators from Afterlight resources", () => {
  assert.equal(
    invitationRoleLabel("user", "customer_employee", "organization"),
    "Field Operator - Customer Employee",
  );
  assert.equal(invitationRoleLabel("user", null, "afterlight_resource"), "Afterlight Resource");
  assert.equal(invitationRoleLabel("contractor", null, "afterlight_resource"), "Afterlight Contractor");
});

test("invitation tokens are high entropy, hashed, and placed in the URL fragment", () => {
  const token = invitationToken();
  assert.ok(token.length >= 43);
  assert.notEqual(hashInvitationToken(token), token);
  const url = invitationUrl(token);
  assert.match(url, /^http:\/\/localhost:3000\/join#/);
  assert.equal(new URL(url).pathname, "/join");
});

test("invitation delivery methods default to email and reject unsupported setup methods", () => {
  assert.equal(normalizeInvitationDeliveryMethod(), "email");
  assert.equal(normalizeInvitationDeliveryMethod(" MANUAL "), "manual");
  assert.throws(() => normalizeInvitationDeliveryMethod("password"), /valid account setup method/);
});

test("organization invitations persist only the token hash and send the one-time link", async () => {
  let createdRecord;
  let sentMail;
  const invitationDocument = {
    _id: "invite-1",
    email: "person@example.com",
    role: "property_manager",
  };
  const result = await createInvitation({
    organization: { _id: "org-1", name: "Example Organization" },
    email: "Person@Example.com",
    role: "property_manager",
    propertyIds: ["property-1"],
    invitedBy: "admin-1",
    inviterScope: "organization",
    accountScope: "afterlight_resource",
    UserModel: {
      findOne: () => ({ select: () => ({ lean: async () => null }) }),
    },
    InvitationModel: {
      updateMany: async () => {},
      create: async (record) => {
        createdRecord = record;
        return { ...invitationDocument, ...record };
      },
    },
    sendEmail: async (mail) => { sentMail = mail; },
    now: new Date("2026-07-31T12:00:00.000Z"),
  });

  assert.equal(result.delivered, true);
  assert.equal(createdRecord.email, "person@example.com");
  assert.equal(createdRecord.accountScope, "afterlight_resource");
  assert.equal(createdRecord.deliveryMethod, "email");
  assert.equal(createdRecord.tokenHash.length, 64);
  assert.equal(sentMail.text.includes(createdRecord.tokenHash), false);
  assert.match(sentMail.text, /\/join#/);
  assert.match(sentMail.text, /\/help\/resource-account-setup/);
  assert.match(sentMail.subject, /Example Organization/);
});

test("organization administrators cannot issue administrator invitations", async () => {
  await assert.rejects(createInvitation({
    organization: { _id: "org-1", name: "Example" },
    email: "admin@example.com",
    role: "admin",
    invitedBy: "user-1",
    inviterScope: "organization",
    UserModel: { findOne: () => ({ select: () => ({ lean: async () => null }) }) },
    InvitationModel: { updateMany: async () => {}, create: async () => ({}) },
  }), /platform administrator/);
});

test("organization invitations normalize Field Operator access and preserve assignment type", async () => {
  let created;
  await createInvitation({
    organization: { _id: "org-1", name: "Example" },
    email: "contractor@example.com",
    role: "field_operator",
    engagementType: "customer_contractor",
    invitedBy: "admin-1",
    inviterScope: "organization",
    deliver: false,
    UserModel: { findOne: () => ({ select: () => ({ lean: async () => null }) }) },
    InvitationModel: {
      updateMany: async () => {},
      create: async (record) => { created = record; return record; },
    },
  });

  assert.equal(created.role, "user");
  assert.equal(created.engagementType, "customer_contractor");
});

test("a licensed organization flow can explicitly create an administrator invitation without delivering inside its transaction", async () => {
  let created;
  const result = await createInvitation({
    organization: { _id: "org-1", name: "Example" },
    email: "admin@example.com",
    role: "admin",
    invitedBy: "user-1",
    inviterScope: "organization",
    allowOrganizationAdmin: true,
    deliver: false,
    UserModel: { findOne: () => ({ select: () => ({ lean: async () => null }) }) },
    InvitationModel: {
      updateMany: async () => {},
      create: async (record) => { created = record; return record; },
    },
  });
  assert.equal(created.role, "admin");
  assert.equal(result.delivered, null);
  assert.ok(result.token);
});

test("resending an expired invitation rotates its token and reactivates it", async () => {
  let saved = false;
  let deliveredText = "";
  const invitation = {
    email: "person@example.com",
    role: "user",
    status: "expired",
    deliveryMethod: "manual",
    tokenHash: "old-hash",
    save: async () => { saved = true; },
  };
  await resendInvitation({
    invitation,
    organization: { name: "Example" },
    sendEmail: async (mail) => { deliveredText = mail.text; },
    now: new Date("2026-07-31T12:00:00.000Z"),
  });
  assert.equal(saved, true);
  assert.equal(invitation.status, "pending");
  assert.equal(invitation.deliveryMethod, "email");
  assert.notEqual(invitation.tokenHash, "old-hash");
  assert.match(deliveredText, /\/join#/);
});

test("manual activation rotates the token without sending email and returns the link once", async () => {
  let saved = false;
  const invitation = {
    email: "mike@example.com",
    role: "property_manager",
    status: "pending",
    deliveryMethod: "email",
    tokenHash: "old-hash",
    save: async () => { saved = true; },
  };
  const result = await createManualActivation({
    invitation,
    now: new Date("2026-08-18T12:00:00.000Z"),
  });

  assert.equal(saved, true);
  assert.equal(invitation.status, "pending");
  assert.equal(invitation.deliveryMethod, "manual");
  assert.notEqual(invitation.tokenHash, "old-hash");
  assert.equal(invitation.expiresAt.toISOString(), "2026-08-25T12:00:00.000Z");
  assert.match(result.setupUrl, /\/join#/);
  assert.equal(result.setupUrl.includes(invitation.tokenHash), false);
});

test("manual activation cannot bypass the dedicated administrator workflow", async () => {
  await assert.rejects(createManualActivation({
    invitation: {
      role: "admin",
      status: "pending",
      save: async () => assert.fail("administrator invitation must not be changed"),
    },
  }), /dedicated administrator workflow/);
});
