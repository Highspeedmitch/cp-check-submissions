const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeInvitationEmail,
  invitationToken,
  hashInvitationToken,
  invitationUrl,
  createInvitation,
  resendInvitation,
} = require("../services/organizationInvitations");

test("invitation emails are normalized and validated", () => {
  assert.equal(normalizeInvitationEmail("  Admin@Example.COM "), "admin@example.com");
  assert.throws(() => normalizeInvitationEmail("not-an-email"), /valid invitation email/);
});

test("invitation tokens are high entropy, hashed, and placed in the URL fragment", () => {
  const token = invitationToken();
  assert.ok(token.length >= 43);
  assert.notEqual(hashInvitationToken(token), token);
  const url = invitationUrl(token);
  assert.match(url, /^http:\/\/localhost:3000\/join#/);
  assert.equal(new URL(url).pathname, "/join");
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

test("resending an expired invitation rotates its token and reactivates it", async () => {
  let saved = false;
  let deliveredText = "";
  const invitation = {
    email: "person@example.com",
    role: "user",
    status: "expired",
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
  assert.notEqual(invitation.tokenHash, "old-hash");
  assert.match(deliveredText, /\/join#/);
});
