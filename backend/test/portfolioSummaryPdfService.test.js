const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateMonthlyPortfolioSummaryPDF,
  portfolioSummaryFileName,
} = require("../portfolioSummaryPdfService");

function sampleReport() {
  return {
    organizationName: "Picor - DEV",
    periodKey: "2026-07",
    periodLabel: "July 2026",
    reportingTimezone: "America/Phoenix",
    recipientSnapshot: { name: "Test PM", email: "pm@example.com" },
    narrative: {
      executiveSummary: "Three inspections were submitted across two managed properties. Recorded issue occurrences increased by one from the prior month.",
      highlights: ["All three scheduled assignments were completed.", "Submission volume increased by one."],
      attentionAreas: ["Lighting was recorded in both reporting months."],
      disclaimer: "This narrative is AI generated from Afterlight reporting data and may contain inaccuracies.",
    },
    comparison: { submissionCountDelta: 1, totalIssueOccurrencesDelta: 1 },
    metrics: {
      submissionCount: 3,
      propertiesWithSubmissionsCount: 2,
      managedPropertyCount: 2,
      inspectionsWithIssuesPercent: 66.7,
      inspectionsWithIssuesCount: 2,
      reportableSubmissionCount: 3,
      totalIssueOccurrences: 3,
      propertyActivity: [
        { name: "Broadway Center", scheduledInspectionCount: 2, completedAssignmentCount: 2, submissionCount: 2, issueOccurrenceCount: 2 },
        { name: "Campbell Center", scheduledInspectionCount: 1, completedAssignmentCount: 1, submissionCount: 1, issueOccurrenceCount: 1 },
      ],
      issues: [
        { label: "Exterior Lighting", occurrences: 2, propertyCount: 2 },
        { label: "Broken Curbs", occurrences: 1, propertyCount: 1 },
      ],
    },
  };
}

test("monthly portfolio PDFs use a stable customer-safe filename", () => {
  assert.equal(
    portfolioSummaryFileName(sampleReport()),
    "Picor - DEV - July 2026 Portfolio Summary.pdf"
  );
});

test("generates a valid monthly executive portfolio PDF", async () => {
  const generated = await generateMonthlyPortfolioSummaryPDF(sampleReport());
  assert.equal(generated.pdfBuffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(generated.pdfBuffer.length > 2000);
  assert.equal(generated.fileName, "Picor - DEV - July 2026 Portfolio Summary.pdf");
});
