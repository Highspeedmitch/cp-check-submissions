const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hashEmailApprovalToken,
  issueEmailApprovalAuthorization,
  maskEmailAddress,
  secureEmailApprovalEligible,
  stageEmailApprovalAuthorization,
} = require("../services/invoiceEmailAuthorization");

test("email approval tokens are stored as hashes and tied to a review cycle", async () => {
  let update;
  const authorization = { _id: "authorization-1" };
  const result = await issueEmailApprovalAuthorization({
    invoice: {
      _id: "invoice-1",
      organizationId: "org-1",
      review: { cycle: 3 },
    },
    organization: { billingCapabilities: { emailApprovalTokenHours: 24 } },
    manager: { _id: "pm-1", email: "PM@Client.Example" },
    randomBytes: () => Buffer.alloc(32, 7),
    now: new Date("2026-08-07T12:00:00Z"),
    AuthorizationModel: {
      findOneAndUpdate: async (...args) => {
        update = args;
        return authorization;
      },
    },
  });

  assert.equal(update[0].reviewCycle, 3);
  assert.equal(update[1].$set.reviewerEmail, "pm@client.example");
  assert.equal(update[1].$set.tokenHash, hashEmailApprovalToken(result.token));
  assert.equal(update[1].$set.tokenHash.includes(result.token), false);
  assert.equal(update[1].$set.expiresAt.toISOString(), "2026-08-08T12:00:00.000Z");
  assert.match(result.url, /billing\/email-approval#token=/);
});

test("secure links support Afterlight and customer contractor invoices with automated AP email", () => {
  const organization = {
    serviceModel: "managed",
    billingCapabilities: { invoiceApprovalExperience: "secure_email_link" },
  };
  const invoice = {
    billingOwner: "afterlight_platform",
    propertySnapshot: { apMethod: "email", apEmail: "ap@client.example" },
  };
  assert.equal(secureEmailApprovalEligible(organization, invoice), true);
  assert.equal(secureEmailApprovalEligible({
    ...organization,
    serviceModel: "boutique",
  }, invoice), true);
  assert.equal(secureEmailApprovalEligible(organization, {
    billingOwner: "customer_submitter",
    fulfillmentSnapshot: { invoiceRouting: "customer_accounts_payable" },
    propertySnapshot: { apMethod: "email", apEmail: "ap@client.example" },
  }), true);
  assert.equal(secureEmailApprovalEligible(organization, {
    ...invoice,
    propertySnapshot: { apMethod: "portal", apEmail: "" },
  }), false);
  assert.equal(maskEmailAddress("accounts@client.example"), "ac••••••@client.example");
});

test("a resend keeps the previous approval token until the new email is accepted", async () => {
  const updates = [];
  const existing = { _id: "authorization-1" };
  const AuthorizationModel = {
    findOne: async () => existing,
    findOneAndUpdate: async (criteria, update) => {
      updates.push({ criteria, update });
      return existing;
    },
  };
  const staged = await stageEmailApprovalAuthorization({
    invoice: {
      _id: "invoice-1",
      organizationId: "org-1",
      review: { cycle: 3 },
    },
    organization: { billingCapabilities: { emailApprovalTokenHours: 24 } },
    manager: { _id: "pm-1", email: "pm@client.example" },
    AuthorizationModel,
    randomBytes: () => Buffer.alloc(32, 9),
    now: new Date("2026-08-13T12:00:00Z"),
  });

  assert.equal(Object.hasOwn(updates[0].update.$set, "tokenHash"), false);
  assert.ok(updates[0].update.$set.pendingTokenHash);
  await staged.rollback();
  assert.equal(Object.hasOwn(updates[1].update.$set, "tokenHash"), false);
  assert.ok(updates[1].update.$unset.pendingTokenHash !== undefined);

  const stagedAgain = await stageEmailApprovalAuthorization({
    invoice: {
      _id: "invoice-1",
      organizationId: "org-1",
      review: { cycle: 3 },
    },
    organization: { billingCapabilities: { emailApprovalTokenHours: 24 } },
    manager: { _id: "pm-1", email: "pm@client.example" },
    AuthorizationModel,
    randomBytes: () => Buffer.alloc(32, 10),
    now: new Date("2026-08-13T12:01:00Z"),
  });
  await stagedAgain.commit({ messageId: "ses-message-2" });
  assert.ok(updates[3].update.$set.tokenHash);
  assert.equal(updates[3].update.$set.providerMessageId, "ses-message-2");
});

test("the first staged approval link is created without an upsert race", async () => {
  let created;
  const updates = [];
  const AuthorizationModel = {
    findOne: async () => null,
    create: async (value) => {
      created = { _id: "authorization-new", ...value };
      return created;
    },
    findOneAndUpdate: async (criteria, update) => {
      updates.push({ criteria, update });
      return created;
    },
  };
  const staged = await stageEmailApprovalAuthorization({
    invoice: {
      _id: "invoice-1",
      organizationId: "org-1",
      review: { cycle: 1 },
    },
    organization: { billingCapabilities: { emailApprovalTokenHours: 24 } },
    manager: { _id: "pm-1", email: "PM@Client.Example" },
    AuthorizationModel,
    randomBytes: () => Buffer.alloc(32, 11),
    now: new Date("2026-08-13T12:00:00Z"),
  });

  assert.equal(created.reviewerEmail, "pm@client.example");
  assert.equal(created.tokenHash, hashEmailApprovalToken(staged.token));
  await staged.commit({ messageId: "ses-message-new" });
  assert.equal(updates[0].criteria.tokenHash, created.tokenHash);
  assert.equal(updates[0].update.$set.providerMessageId, "ses-message-new");
});

test("a concurrent staged link refresh cannot replace the in-flight token", async () => {
  const AuthorizationModel = {
    findOne: async () => ({ _id: "authorization-1" }),
    findOneAndUpdate: async () => null,
  };
  await assert.rejects(
    stageEmailApprovalAuthorization({
      invoice: {
        _id: "invoice-1",
        organizationId: "org-1",
        review: { cycle: 3 },
      },
      organization: { billingCapabilities: { emailApprovalTokenHours: 24 } },
      manager: { _id: "pm-1", email: "pm@client.example" },
      AuthorizationModel,
      randomBytes: () => Buffer.alloc(32, 12),
      now: new Date("2026-08-13T12:00:00Z"),
    }),
    /already in progress/i
  );
});
