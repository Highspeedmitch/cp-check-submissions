const test = require("node:test");
const assert = require("node:assert/strict");
const {
  claimMonthlyPortfolioSummary,
  deliverPortfolioEmail,
  enqueueMonthlyPortfolioSummary,
  monthlyPortfolioSummaryEmail,
} = require("../services/monthlyPortfolioSummaryWorker");

test("monthly summaries enqueue with an immutable recipient property snapshot", async () => {
  let captured;
  const result = { _id: "report-1", status: "queued" };
  const ReportModel = {
    async findOneAndUpdate(query, update, options) {
      captured = { query, update, options };
      return result;
    },
  };
  const report = await enqueueMonthlyPortfolioSummary({
    organization: {
      _id: "org-1",
      name: "Picor - DEV",
      reportingTimezone: "America/Phoenix",
      properties: [
        { _id: "property-1", name: "Broadway", propertyManagers: ["pm-1"] },
        { _id: "property-2", name: "Campbell", propertyManagers: ["pm-2"] },
      ],
    },
    recipient: {
      _id: "pm-1",
      username: "Portfolio Manager",
      email: "pm@example.com",
      role: "property_manager",
    },
    period: {
      key: "2026-07",
      label: "July 2026",
      start: new Date("2026-07-01T07:00:00Z"),
      end: new Date("2026-08-01T07:00:00Z"),
      timezone: "America/Phoenix",
    },
    mode: "preview",
    ReportModel,
  });
  assert.equal(report, result);
  assert.deepEqual(captured.query, {
    organizationId: "org-1",
    recipientUserId: "pm-1",
    periodKey: "2026-07",
  });
  assert.deepEqual(captured.update.$setOnInsert.propertySnapshots, [{
    propertyId: "property-1",
    name: "Broadway",
  }]);
  assert.equal(captured.options.upsert, true);
});

test("monthly summary claims use an atomic lease and increment attempts", async () => {
  let captured;
  const ReportModel = {
    async findOneAndUpdate(query, update, options) {
      captured = { query, update, options };
      return { _id: "report-1" };
    },
  };
  const now = new Date("2026-08-01T12:00:00Z");
  await claimMonthlyPortfolioSummary({ ReportModel, now, id: "worker-1" });
  assert.equal(captured.update.$set.status, "processing");
  assert.equal(captured.update.$set.lockedBy, "worker-1");
  assert.equal(captured.update.$inc.attempts, 1);
  assert.equal(captured.options.sort.availableAt, 1);
});

test("preview mode stores a report without sending email", async () => {
  let sent = 0;
  const report = {
    mode: "preview",
    emailSentAt: null,
    async save() {},
  };
  await deliverPortfolioEmail(report, { pdfBuffer: Buffer.from("pdf"), fileName: "report.pdf" }, {
    env: { MONTHLY_PORTFOLIO_SUMMARY_MODE: "preview" },
    async sendEmail() { sent += 1; },
  });
  assert.equal(sent, 0);
  assert.equal(report.emailSentAt, null);
});

test("changing the deployment from live to preview stops unsent email delivery", async () => {
  let sent = 0;
  const report = {
    mode: "live",
    emailSentAt: null,
    async save() {},
  };
  await deliverPortfolioEmail(report, { pdfBuffer: Buffer.from("pdf"), fileName: "report.pdf" }, {
    env: { MONTHLY_PORTFOLIO_SUMMARY_MODE: "preview" },
    async sendEmail() { sent += 1; },
  });
  assert.equal(sent, 0);
  assert.equal(report.emailSentAt, null);
});

test("live mode emails only the intended property manager with the PDF attached", async () => {
  let mail;
  const report = {
    mode: "live",
    periodLabel: "July 2026",
    organizationName: "Picor",
    recipientSnapshot: { email: "pm@example.com" },
    emailSentAt: null,
    emailError: "",
    saves: 0,
    async save() { this.saves += 1; },
  };
  const generated = { pdfBuffer: Buffer.from("pdf"), fileName: "report.pdf" };
  assert.equal(monthlyPortfolioSummaryEmail(report, generated).to, "pm@example.com");
  await deliverPortfolioEmail(report, generated, {
    env: { MONTHLY_PORTFOLIO_SUMMARY_MODE: "live" },
    async sendEmail(value) { mail = value; },
  });
  assert.equal(mail.to, "pm@example.com");
  assert.equal(mail.attachments[0].filename, "report.pdf");
  assert.ok(report.emailSentAt instanceof Date);
  assert.equal(report.saves, 1);
});
