const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inspectionPdfForInvoice,
  resendInvoiceReviewEmail,
  validateResendInput,
} = require("../services/invoiceReviewResend");

function queryResult(value) {
  return {
    select() {
      return { lean: async () => value };
    },
  };
}

function pendingInvoice(overrides = {}) {
  return {
    _id: "invoice-1",
    organizationId: "org-1",
    submissionId: "submission-1",
    status: "pending_review",
    pdfKey: "org-1/invoices/invoice.pdf",
    propertySnapshot: { name: "Commerce Center" },
    review: { cycle: 2, emailSentAt: null, emailError: "" },
    save: async function save() { this.saved = (this.saved || 0) + 1; },
    ...overrides,
  };
}

function attemptModel() {
  const records = [];
  return {
    records,
    findOne(criteria) {
      if (criteria.requestId) {
        return Promise.resolve(records.find((record) => (
          String(record.invoiceId) === String(criteria.invoiceId)
          && record.requestId === criteria.requestId
        )) || null);
      }
      return { sort: async () => null };
    },
    async create(value) {
      const record = {
        _id: `attempt-${records.length + 1}`,
        createdAt: new Date("2026-08-13T12:00:00Z"),
        ...value,
        async save() {},
      };
      records.push(record);
      return record;
    },
  };
}

test("loads the durable inspection report associated with an invoice", async () => {
  let requestedKey;
  const result = await inspectionPdfForInvoice(pendingInvoice(), {
    SubmissionModel: {
      findOne: () => queryResult({
        processingJobId: "job-1",
        property: "Commerce Center",
        pdfUrl: "https://bucket.example/fallback.pdf",
      }),
    },
    InspectionJobModel: {
      findOne: () => queryResult({
        pdfKey: "org-1/commerce/report.pdf",
        pdfFileName: "Commerce Center Inspection.pdf",
      }),
    },
    storage: {
      getObject({ Key }) {
        requestedKey = Key;
        return { promise: async () => ({ Body: Buffer.from("inspection") }) };
      },
    },
  });

  assert.equal(requestedKey, "org-1/commerce/report.pdf");
  assert.equal(result.filename, "Commerce Center Inspection.pdf");
  assert.deepEqual(result.content, Buffer.from("inspection"));
});

test("resends both existing documents without changing invoice review state", async () => {
  const invoice = pendingInvoice();
  const AttemptModel = attemptModel();
  const emailed = [];
  const result = await resendInvoiceReviewEmail({
    invoice,
    recipientUserIds: ["pm-2"],
    reason: "Customer quarantine was cleared.",
    requestId: "request_1234567890",
    requestedBy: "platform-1",
  }, {
    AttemptModel,
    findManagers: async () => [
      { _id: "pm-1", username: "Jordan", email: "jordan@picor.example" },
      { _id: "pm-2", username: "Taylor", email: "taylor@picor.example" },
    ],
    loadInspectionPdf: async () => ({
      key: "org-1/commerce/report.pdf",
      filename: "inspection-report.pdf",
      content: Buffer.from("inspection"),
    }),
    sendReviewEmail: async (record, managers, options) => {
      emailed.push({ record, managers, options });
      return [{ providerMessageId: "ses-review-message-1" }];
    },
    confirmPendingReview: async () => true,
    now: () => new Date("2026-08-13T12:01:00Z"),
  });

  assert.equal(emailed.length, 1);
  assert.deepEqual(emailed[0].managers.map((manager) => manager._id), ["pm-2"]);
  assert.equal(emailed[0].options.inspectionPdf.filename, "inspection-report.pdf");
  assert.equal(emailed[0].options.preserveExistingAuthorizationOnFailure, true);
  assert.equal(invoice.status, "pending_review");
  assert.equal(invoice.review.cycle, 2);
  assert.ok(invoice.review.emailSentAt instanceof Date);
  assert.equal(result.attempt.status, "accepted");
  assert.equal(result.attempt.recipients[0].providerMessageId, "ses-review-message-1");
  assert.equal(AttemptModel.records[0].invoicePdfKey, "org-1/invoices/invoice.pdf");
  assert.equal(AttemptModel.records[0].inspectionPdfKey, "org-1/commerce/report.pdf");
});

test("rejects a recipient who is no longer assigned without sending", async () => {
  let sent = false;
  await assert.rejects(
    resendInvoiceReviewEmail({
      invoice: pendingInvoice(),
      recipientUserIds: ["former-pm"],
      reason: "Requested by customer.",
      requestId: "request_1234567890",
      requestedBy: "platform-1",
    }, {
      AttemptModel: attemptModel(),
      findManagers: async () => [{ _id: "pm-1", email: "pm@picor.example" }],
      loadInspectionPdf: async () => assert.fail("report should not load"),
      sendReviewEmail: async () => { sent = true; },
    }),
    (error) => error.status === 409 && error.code === "INVOICE_REVIEW_RECIPIENT_CHANGED"
  );
  assert.equal(sent, false);
});

test("rechecks the review cycle before sending either attachment", async () => {
  let sent = false;
  await assert.rejects(
    resendInvoiceReviewEmail({
      invoice: pendingInvoice(),
      recipientUserIds: ["pm-1"],
      reason: "Customer requested another copy.",
      requestId: "request_1234567890",
      requestedBy: "platform-1",
    }, {
      AttemptModel: attemptModel(),
      findManagers: async () => [{ _id: "pm-1", email: "pm@picor.example" }],
      loadInspectionPdf: async () => ({
        key: "org-1/report.pdf",
        filename: "report.pdf",
        content: Buffer.from("report"),
      }),
      confirmPendingReview: async () => false,
      sendReviewEmail: async () => { sent = true; },
    }),
    (error) => error.status === 409 && error.code === "INVOICE_REVIEW_CHANGED"
  );
  assert.equal(sent, false);
});

test("a concurrent duplicate request is replayed from the durable attempt", async () => {
  const completed = {
    _id: "attempt-existing",
    invoiceId: "invoice-1",
    requestId: "request_1234567890",
    reviewCycle: 2,
    status: "accepted",
    recipients: [{ userId: "pm-1", email: "pm@picor.example", status: "accepted" }],
  };
  let requestLookups = 0;
  let sent = false;
  const AttemptModel = {
    findOne(criteria) {
      if (criteria.requestId) {
        requestLookups += 1;
        return Promise.resolve(requestLookups === 1 ? null : completed);
      }
      return { sort: async () => null };
    },
    async create() {
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    },
  };

  const result = await resendInvoiceReviewEmail({
    invoice: pendingInvoice(),
    recipientUserIds: ["pm-1"],
    reason: "Customer requested another copy.",
    requestId: "request_1234567890",
    requestedBy: "platform-1",
  }, {
    AttemptModel,
    findManagers: async () => [{ _id: "pm-1", email: "pm@picor.example" }],
    loadInspectionPdf: async () => ({
      key: "org-1/report.pdf",
      filename: "report.pdf",
      content: Buffer.from("report"),
    }),
    confirmPendingReview: async () => true,
    sendReviewEmail: async () => { sent = true; },
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.attempt._id, "attempt-existing");
  assert.equal(sent, false);
});

test("requires an auditable reason and stable request identifier", () => {
  assert.throws(
    () => validateResendInput({
      recipientUserIds: ["pm-1"],
      reason: "",
      requestId: "request_1234567890",
    }),
    /resend reason/i
  );
  assert.throws(
    () => validateResendInput({
      recipientUserIds: ["pm-1"],
      reason: "Customer requested another copy.",
      requestId: "short",
    }),
    /identifier/i
  );
});
