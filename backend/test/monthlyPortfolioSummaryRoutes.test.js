const test = require("node:test");
const assert = require("node:assert/strict");
const {
  monthlySummaryQuery,
  serializeMonthlySummary,
} = require("../Routes/reporting");

test("property-manager monthly archive queries are recipient scoped", () => {
  assert.deepEqual(monthlySummaryQuery({
    user: {
      role: "property_manager",
      userId: "pm-1",
      organizationId: "org-1",
    },
  }), {
    organizationId: "org-1",
    recipientUserId: "pm-1",
  });
  assert.deepEqual(monthlySummaryQuery({
    user: {
      role: "admin",
      userId: "admin-1",
      organizationId: "org-1",
    },
  }), {
    organizationId: "org-1",
  });
});

test("monthly archive download links are exposed only after PDF completion", () => {
  const base = {
    _id: "summary-1",
    recipientUserId: "pm-1",
    recipientSnapshot: { name: "Jordan", email: "jordan@example.com" },
    propertySnapshots: [{ name: "Broadway" }],
  };
  assert.equal(serializeMonthlySummary({
    ...base,
    status: "processing",
    pdfKey: "portfolio-summaries/report.pdf",
  }).downloadUrl, null);
  assert.equal(serializeMonthlySummary({
    ...base,
    status: "completed",
    pdfKey: "portfolio-summaries/report.pdf",
  }).downloadUrl, "/api/reporting/monthly-summaries/summary-1/download");
});
