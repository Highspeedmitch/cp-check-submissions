const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeAdminInvitationEmails,
  createLicensedAdminInvitations,
} = require("../services/licensedAdminInvitations");

function findResult(rows = []) {
  return {
    select() { return this; },
    async lean() { return rows; },
  };
}

function organization(serviceModel = "platform", tier = "tier_1") {
  return {
    _id: "org-1",
    name: "Example Organization",
    serviceModel,
    license: { tier, adminSeatVersion: 0 },
    saveCount: 0,
    async save() { this.saveCount += 1; },
  };
}

function dependencies({ active = 1, pending = 0, serviceModel = "platform", tier = "tier_1" } = {}) {
  const org = organization(serviceModel, tier);
  const created = [];
  const delivered = [];
  let countCall = 0;
  return {
    org,
    created,
    delivered,
    options: {
      OrganizationModel: { async findById() { return org; } },
      UserModel: { async countDocuments() { countCall += 1; return active; } },
      InvitationModel: {
        async countDocuments() { countCall += 1; return pending; },
        find() { return findResult([]); },
      },
      PlatformAuditModel: { async create() {} },
      consumeAdminGrant: async (grant) => {
        assert.equal(grant.purpose, "invite_admin");
        assert.equal(grant.token, "grant-1");
        return true;
      },
      createInvitationRecord: async ({ email }) => {
        const invitation = {
          _id: `invite-${created.length + 1}`,
          email,
          role: "admin",
          status: "pending",
          expiresAt: new Date("2026-08-12T00:00:00.000Z"),
          lastSentAt: new Date("2026-08-05T00:00:00.000Z"),
        };
        created.push(invitation);
        return { invitation, token: `token-${created.length}` };
      },
      deliverInvitationEmail: async ({ invitation }) => { delivered.push(invitation.email); },
      transactionRunner: async (work) => work({ id: "test-session" }),
      now: new Date("2026-08-05T00:00:00.000Z"),
    },
  };
}

test("administrator email batches are normalized and deduplicated", () => {
  assert.deepEqual(normalizeAdminInvitationEmails([
    " FIRST@example.com, second@example.com ",
    "first@example.com",
  ]), ["first@example.com", "second@example.com"]);
});

test("Tier 1 allows an existing administrator to invite the second administrator", async () => {
  const fixture = dependencies();
  const result = await createLicensedAdminInvitations({
    organizationId: "org-1",
    invitedBy: "admin-1",
    emails: ["second@example.com"],
    adminActionGrant: "grant-1",
    ...fixture.options,
  });
  assert.equal(result.adminSeats.limit, 2);
  assert.equal(result.adminSeats.allocated, 2);
  assert.equal(result.adminSeats.remaining, 0);
  assert.deepEqual(fixture.delivered, ["second@example.com"]);
  assert.equal(fixture.org.saveCount, 1);
  assert.equal(fixture.org.license.adminSeatVersion, 1);
});

test("Tier 1 rejects an invitation after all administrator seats are allocated", async () => {
  const fixture = dependencies({ active: 2 });
  await assert.rejects(createLicensedAdminInvitations({
    organizationId: "org-1",
    invitedBy: "admin-1",
    emails: ["third@example.com"],
    adminActionGrant: "grant-1",
    ...fixture.options,
  }), (error) => error.code === "ADMIN_LIMIT_REACHED" && error.adminSeats.remaining === 0);
  assert.equal(fixture.created.length, 0);
});

test("Tier 2 exposes three administrator seats", async () => {
  const fixture = dependencies({ active: 1, tier: "tier_2" });
  const result = await createLicensedAdminInvitations({
    organizationId: "org-1",
    invitedBy: "admin-1",
    emails: ["second@example.com", "third@example.com"],
    adminActionGrant: "grant-1",
    ...fixture.options,
  });
  assert.equal(result.adminSeats.limit, 3);
  assert.equal(result.adminSeats.allocated, 3);
  assert.equal(fixture.created.length, 2);
});

test("managed service administrator invitations are unmetered", async () => {
  const fixture = dependencies({ active: 20, serviceModel: "managed", tier: null });
  const result = await createLicensedAdminInvitations({
    organizationId: "org-1",
    invitedBy: "admin-1",
    emails: ["another@example.com"],
    adminActionGrant: "grant-1",
    ...fixture.options,
  });
  assert.equal(result.adminSeats.unmetered, true);
  assert.equal(result.adminSeats.limit, null);
});
