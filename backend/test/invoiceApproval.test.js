const test = require("node:test");
const assert = require("node:assert/strict");
const { approveInvoiceAndSendToAp } = require("../services/invoiceApproval");

test("approval snapshots the property manager and sends the invoice to AP", async () => {
  const existing = {
    _id: "invoice-1",
    organizationId: "org-1",
    submitterId: "submitter-1",
    status: "pending_review",
    billingOwner: "afterlight_platform",
    review: { decision: "" },
  };
  const claimed = {
    ...existing,
    status: "approving",
    review: {
      decision: "approved",
      approverSnapshot: {
        name: "Jordan Lee",
        email: "jordan@client.example",
      },
    },
    delivery: {},
    statusHistory: [],
    save: async function save() { this.saved = true; },
  };
  let update;
  let delivered = false;

  const result = await approveInvoiceAndSendToAp({
    invoiceId: "invoice-1",
    organizationId: "org-1",
    actor: { userId: "pm-1", role: "property_manager" },
    InvoiceModel: {
      findOne: async () => existing,
      findOneAndUpdate: async (_query, nextUpdate) => {
        update = nextUpdate;
        return claimed;
      },
    },
    UserModel: {
      findOne: () => ({
        select: () => ({
          lean: async () => ({
            _id: "pm-1",
            username: "Jordan Lee",
            email: "Jordan@Client.Example",
            role: "property_manager",
          }),
        }),
      }),
    },
    evaluateAction: async () => ({ allowed: true }),
    deliverToAp: async (invoice) => {
      delivered = true;
      assert.equal(invoice.review.approverSnapshot.name, "Jordan Lee");
      return { status: "accepted", warning: "Queued for AP delivery." };
    },
    notifyDeliveryState: async () => {},
  });

  assert.equal(update.$set["review.method"], "authenticated_portal");
  assert.equal(update.$set["review.approverSnapshot.name"], "Jordan Lee");
  assert.equal(update.$set["review.approverSnapshot.email"], "jordan@client.example");
  assert.equal(delivered, true);
  assert.equal(result.invoice.status, "submitted");
  assert.equal(result.invoice.saved, true);
});
