const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_PHOTOS,
  MAX_PHOTOS_PER_FIELD,
  cleanSubmissionData,
  normalizePhotoRequests,
  resolveCustomerContractorInvoiceSettings,
} = require("../services/inspectionJobs");
const {
  claimInspectionJob,
  deliverInspectionEmail,
  deliverInspectionEmailWithReviewFallback,
  recordJobFailure,
} = require("../services/inspectionWorker");

test("inspection job payloads only retain bounded string responses", () => {
  assert.deepEqual(cleanSubmissionData({
    graffiti: " yes ",
    graffitiDescription: 123,
  }), {
    graffiti: "yes",
    graffitiDescription: "123",
  });
  assert.throws(
    () => cleanSubmissionData({ "../invalid": "value" }),
    /invalid response field/
  );
});

test("customer contractor invoice settings default to admin auto-submit and preserve one-off review", () => {
  const assignment = { fulfillment: { source: "customer_contractor" } };
  const property = {
    defaultInspectionAmountCents: 15000,
    autoSubmitCustomerContractorInvoices: true,
  };
  assert.deepEqual(resolveCustomerContractorInvoiceSettings({ assignment, property }), {
    preference: "auto_submit",
    amountCents: 15000,
  });
  assert.deepEqual(resolveCustomerContractorInvoiceSettings({
    assignment,
    property,
    requestedPreference: "review_first",
  }), {
    preference: "review_first",
    amountCents: 15000,
  });
  assert.deepEqual(resolveCustomerContractorInvoiceSettings({
    assignment: { fulfillment: { source: "customer_employee" } },
    property,
  }), {
    preference: "not_applicable",
    amountCents: null,
  });
});

test("photo reservations enforce allowed fields and per-field limits", () => {
  const requests = Array.from({ length: MAX_PHOTOS_PER_FIELD }, (_, index) => ({
    fieldName: "graffiti",
    fileName: `${index}.jpg`,
  }));
  assert.equal(MAX_PHOTOS, 15);
  assert.equal(MAX_PHOTOS_PER_FIELD, 6);
  assert.equal(
    normalizePhotoRequests(requests, (field) => field === "graffiti").length,
    MAX_PHOTOS_PER_FIELD
  );
  assert.throws(
    () => normalizePhotoRequests([...requests, requests[0]], () => true),
    /Up to 6 photos/
  );
  const withinTotalLimit = Array.from({ length: MAX_PHOTOS }, (_, index) => ({
    fieldName: `field_${index % 3}`,
    fileName: `${index}.jpg`,
  }));
  assert.equal(
    normalizePhotoRequests(withinTotalLimit, () => true).length,
    MAX_PHOTOS
  );
  assert.throws(
    () => normalizePhotoRequests([...withinTotalLimit, {
      fieldName: "field_3",
      fileName: "too-many.jpg",
    }], () => true),
    /up to 15 photos/i
  );
  assert.throws(
    () => normalizePhotoRequests([{ fieldName: "private", fileName: "x.jpg" }], () => false),
    /Photos are not allowed/
  );
});

test("workers atomically claim queued or expired-lease jobs", async () => {
  let received;
  const expected = { _id: "job-1" };
  const JobModel = {
    findOneAndUpdate(query, update, options) {
      received = { query, update, options };
      return expected;
    },
  };
  const now = new Date("2026-07-31T12:00:00Z");
  assert.equal(await claimInspectionJob({ JobModel, now, id: "worker-1" }), expected);
  assert.equal(received.update.$set.status, "processing");
  assert.equal(received.update.$set.lockedBy, "worker-1");
  assert.equal(received.update.$inc.attempts, 1);
  assert.equal(received.options.sort.availableAt, 1);
  assert.equal(received.query.$or[0].status, "queued");
  assert.equal(received.query.$or[1].status, "processing");
});

test("failed jobs retry with backoff but preserve completed submissions", async () => {
  const retrying = {
    attempts: 1,
    maxAttempts: 3,
    submissionId: null,
    async save() {},
  };
  await recordJobFailure(retrying, new Error("temporary"));
  assert.equal(retrying.status, "queued");
  assert.match(retrying.lastError, /temporary/);

  const delivered = {
    attempts: 3,
    maxAttempts: 3,
    submissionId: "submission-1",
    async save() {},
  };
  await recordJobFailure(delivered, new Error("email unavailable"));
  assert.equal(delivered.status, "completed");
  assert.match(delivered.emailError, /email unavailable/);
});

test("inspection email failure is recorded without failing completed processing", async () => {
  let savedMail;
  const job = {
    _id: "job-email-1",
    orgType: "COM",
    propertyName: "Winterhaven Square",
    createdAt: new Date("2026-08-02T12:00:00Z"),
    pdfFileName: "inspection.pdf",
    emailSentAt: null,
    emailError: "",
  };
  const result = await deliverInspectionEmail(
    job,
    ["pm@example.com"],
    { pdfBuffer: Buffer.from("pdf") },
    {
      sendEmail: async (mail) => {
        savedMail = mail;
        throw new Error("The security token included in the request is invalid.");
      },
    }
  );

  assert.equal(result.sent, false);
  assert.equal(savedMail.to, "pm@example.com");
  assert.match(job.emailError, /security token/i);
  assert.equal(job.emailSentAt, null);
});

test("a successful Afterlight invoice review email suppresses the checklist-only email", async () => {
  const reviewEmailSentAt = new Date("2026-08-03T20:15:00Z");
  const job = { emailSentAt: null, emailError: "previous warning" };
  let standaloneDeliveries = 0;

  const result = await deliverInspectionEmailWithReviewFallback(
    job,
    ["pm@example.com"],
    { pdfBuffer: Buffer.from("checklist") },
    { invoice: { review: { emailSentAt: reviewEmailSentAt } } },
    {
      deliverStandalone: async () => {
        standaloneDeliveries += 1;
        return { sent: true, warning: "" };
      },
    }
  );

  assert.equal(result.sent, true);
  assert.equal(result.delivery, "invoice_review");
  assert.equal(standaloneDeliveries, 0);
  assert.equal(job.emailSentAt, reviewEmailSentAt);
  assert.equal(job.emailError, "");
});

test("an unavailable invoice review email retains the checklist-only fallback", async () => {
  const job = { emailSentAt: null, emailError: "" };
  let standaloneDeliveries = 0;

  const result = await deliverInspectionEmailWithReviewFallback(
    job,
    ["pm@example.com"],
    { pdfBuffer: Buffer.from("checklist") },
    { invoice: { review: { emailSentAt: null } }, warning: "Review email delivery failed." },
    {
      deliverStandalone: async () => {
        standaloneDeliveries += 1;
        return { sent: true, warning: "" };
      },
    }
  );

  assert.equal(result.sent, true);
  assert.equal(result.delivery, "standalone");
  assert.equal(standaloneDeliveries, 1);
});
