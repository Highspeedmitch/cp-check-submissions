const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hashEmailApprovalToken,
  issueEmailApprovalAuthorization,
  maskEmailAddress,
  secureEmailApprovalEligible,
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
