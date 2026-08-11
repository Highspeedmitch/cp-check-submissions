const test = require("node:test");
const assert = require("node:assert/strict");
const Organization = require("../models/organization");
const {
  monthlySummaryQuery,
  requirePortfolioReporting,
  serializeMonthlySummary,
} = require("../Routes/reporting");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

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

test("reporting middleware forbids Boutique before a reporting handler runs", async () => {
  const originalFindById = Organization.findById;
  try {
    Organization.findById = async () => ({
      _id: "org-boutique",
      name: "Boutique Client",
      serviceModel: "boutique",
    });
    const res = responseRecorder();
    let nextCalls = 0;
    await requirePortfolioReporting({
      user: { organizationId: "org-boutique", role: "property_manager" },
    }, res, () => { nextCalls += 1; });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "REPORTING_NOT_INCLUDED");
    assert.match(res.body.error, /Boutique service/i);
    assert.equal(nextCalls, 0);
  } finally {
    Organization.findById = originalFindById;
  }
});

test("reporting middleware passes an included plan and attaches its organization", async () => {
  const originalFindById = Organization.findById;
  try {
    const organization = { _id: "org-managed", serviceModel: "managed" };
    Organization.findById = async () => organization;
    const req = { user: { organizationId: "org-managed", role: "property_manager" } };
    const res = responseRecorder();
    let nextCalls = 0;
    await requirePortfolioReporting(req, res, () => { nextCalls += 1; });

    assert.equal(nextCalls, 1);
    assert.equal(req.reportingOrganization, organization);
    assert.equal(res.statusCode, 200);
  } finally {
    Organization.findById = originalFindById;
  }
});
