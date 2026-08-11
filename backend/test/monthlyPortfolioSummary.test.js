const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PORTFOLIO_NARRATIVE_MAX_TOKENS,
  buildFallbackPortfolioNarrative,
  buildPortfolioComparison,
  buildPortfolioMetrics,
  ensurePortfolioNarrative,
  isMonthlyPortfolioSummaryOrganizationAllowed,
  monthlyPortfolioSummaryMode,
  parsePortfolioNarrative,
  periodForKey,
  previousMonthPeriod,
  propertiesForPortfolioRecipient,
} = require("../services/monthlyPortfolioSummary");

const ISSUE_FIELDS = [
  { key: "lights", label: "Exterior Lighting", type: "yes_no_issue" },
  { key: "curbs", label: "Broken Curbs", type: "yes_no_issue" },
];

test("monthly portfolio mode and organization allowlist fail closed", () => {
  const organization = { _id: "org-picor", name: "Picor - DEV" };
  assert.equal(monthlyPortfolioSummaryMode({}), "off");
  assert.equal(monthlyPortfolioSummaryMode({ MONTHLY_PORTFOLIO_SUMMARY_MODE: "PREVIEW" }), "preview");
  assert.equal(monthlyPortfolioSummaryMode({ MONTHLY_PORTFOLIO_SUMMARY_MODE: "unknown" }), "off");
  assert.equal(isMonthlyPortfolioSummaryOrganizationAllowed(organization, {}), false);
  assert.equal(isMonthlyPortfolioSummaryOrganizationAllowed(organization, {
    MONTHLY_PORTFOLIO_SUMMARY_ORGANIZATION_ALLOWLIST: "PICOR - DEV",
  }), true);
  assert.equal(isMonthlyPortfolioSummaryOrganizationAllowed({
    ...organization,
    serviceModel: "boutique",
  }, {
    MONTHLY_PORTFOLIO_SUMMARY_ORGANIZATION_ALLOWLIST: "PICOR - DEV,org-picor",
  }), false);
  assert.equal(isMonthlyPortfolioSummaryOrganizationAllowed(organization, {
    MONTHLY_PORTFOLIO_SUMMARY_ORGANIZATION_ALLOWLIST: "Picor",
  }), false);
});

test("monthly periods use the organization reporting timezone", () => {
  const period = periodForKey("2026-07", "America/Phoenix");
  assert.equal(period.label, "July 2026");
  assert.equal(period.start.toISOString(), "2026-07-01T07:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-08-01T07:00:00.000Z");
  assert.equal(
    previousMonthPeriod("America/Phoenix", new Date("2026-08-01T06:30:00.000Z")).key,
    "2026-06"
  );
  assert.throws(() => periodForKey("2026-13", "America/Phoenix"), /invalid/);
});

test("portfolio recipients receive only their currently managed properties", () => {
  const organization = {
    properties: [
      { _id: "property-1", name: "Broadway", propertyManagers: ["pm-1"] },
      { _id: "property-2", name: "Campbell", propertyManagers: ["pm-2"] },
    ],
  };
  assert.deepEqual(
    propertiesForPortfolioRecipient(organization, { _id: "pm-1", role: "property_manager" })
      .map((property) => property.name),
    ["Broadway"]
  );
  assert.equal(propertiesForPortfolioRecipient(organization, { _id: "admin-1", role: "admin" }).length, 2);
  assert.equal(propertiesForPortfolioRecipient(organization, { _id: "user-1", role: "user" }).length, 0);
});

test("portfolio metrics preserve reporting coverage and assignment state", () => {
  const metrics = buildPortfolioMetrics({
    properties: [
      { propertyId: "property-1", name: "Broadway" },
      { propertyId: "property-2", name: "Campbell" },
      { propertyId: "property-3", name: "Glenn" },
    ],
    users: [
      { _id: "operator-1", username: "Sam" },
      { _id: "operator-2", username: "Alex" },
    ],
    submissions: [
      {
        userId: "operator-1",
        property: "Broadway",
        assignmentId: "assignment-1",
        responses: { lights: "yes", curbs: "no" },
        templateSnapshot: { fields: ISSUE_FIELDS },
      },
      {
        userId: "operator-2",
        property: "Campbell",
        assignmentId: null,
        responses: { lights: "no", curbs: "no" },
        templateSnapshot: { fields: ISSUE_FIELDS },
      },
    ],
    assignments: [
      { propertyName: "Broadway", status: "completed" },
      { propertyName: "Campbell", status: "scheduled" },
      { propertyName: "Glenn", status: "canceled" },
    ],
  });

  assert.equal(metrics.managedPropertyCount, 3);
  assert.equal(metrics.propertiesWithSubmissionsCount, 2);
  assert.deepEqual(metrics.propertiesWithoutSubmissions, ["Glenn"]);
  assert.equal(metrics.submissionCount, 2);
  assert.equal(metrics.scheduledInspectionCount, 2);
  assert.equal(metrics.completedAssignmentCount, 1);
  assert.equal(metrics.incompleteScheduledCount, 1);
  assert.equal(metrics.canceledAssignmentCount, 1);
  assert.equal(metrics.directSubmissionCount, 1);
  assert.equal(metrics.assignmentCompletionPercent, 50);
  assert.equal(metrics.reportableSubmissionCount, 2);
  assert.equal(metrics.inspectionsWithIssuesCount, 1);
  assert.equal(metrics.inspectionsWithIssuesPercent, 50);
  assert.equal(metrics.totalIssueOccurrences, 1);
  assert.equal(metrics.issues[0].label, "Exterior Lighting");
  assert.equal(metrics.operators[0].name, "Alex");
});

test("month-over-month comparison labels repeat and newly observed issue types", () => {
  const comparison = buildPortfolioComparison({
    submissionCount: 5,
    completedAssignmentCount: 4,
    inspectionsWithIssuesCount: 3,
    totalIssueOccurrences: 4,
    issues: [
      { key: "lights", label: "Lighting" },
      { key: "curbs", label: "Curbs" },
    ],
  }, {
    submissionCount: 3,
    completedAssignmentCount: 3,
    inspectionsWithIssuesCount: 1,
    totalIssueOccurrences: 2,
    issues: [
      { key: "lights", label: "Lighting" },
      { key: "graffiti", label: "Graffiti" },
    ],
  });
  assert.equal(comparison.submissionCountDelta, 2);
  assert.deepEqual(comparison.repeatIssueTypes, ["Lighting"]);
  assert.deepEqual(comparison.newlyObservedIssueTypes, ["Curbs"]);
  assert.deepEqual(comparison.noLongerObservedIssueTypes, ["Graffiti"]);
});

test("Bedrock portfolio narratives are parsed and invoked with an explicit token ceiling", async () => {
  let commandInput;
  const report = {
    periodLabel: "July 2026",
    metrics: {
      managedPropertyCount: 1,
      propertiesWithSubmissionsCount: 1,
      propertiesWithoutSubmissions: [],
      submissionCount: 2,
      scheduledInspectionCount: 2,
      completedAssignmentCount: 2,
      incompleteScheduledCount: 0,
      reportableSubmissionCount: 2,
      inspectionsWithIssuesCount: 1,
      totalIssueOccurrences: 1,
      issues: [{ key: "lights", label: "Lighting", occurrences: 1, propertyCount: 1 }],
      propertyActivity: [{ name: "Broadway", submissionCount: 2, scheduledInspectionCount: 2, completedAssignmentCount: 2, issueOccurrenceCount: 1 }],
    },
    previousMetrics: {
      submissionCount: 1,
      completedAssignmentCount: 1,
      inspectionsWithIssuesCount: 0,
      totalIssueOccurrences: 0,
    },
    comparison: {
      submissionCountDelta: 1,
      completedAssignmentCountDelta: 1,
      inspectionsWithIssuesCountDelta: 1,
      totalIssueOccurrencesDelta: 1,
      repeatIssueTypes: [],
      newlyObservedIssueTypes: ["Lighting"],
      noLongerObservedIssueTypes: [],
    },
    narrative: null,
    saves: 0,
    async save() { this.saves += 1; },
  };
  const client = {
    async send(command) {
      commandInput = command.input;
      return {
        stopReason: "end_turn",
        output: { message: { content: [{ text: JSON.stringify({
          executiveSummary: "Two inspections were submitted during July.",
          highlights: ["Submission volume increased by one."],
          attentionAreas: ["Lighting was recorded once."],
        }) }] } },
        usage: { inputTokens: 500, outputTokens: 80 },
        metrics: { latencyMs: 300 },
      };
    },
  };

  const narrative = await ensurePortfolioNarrative(report, {
    client,
    env: { AWS_REGION: "us-east-2", MONTHLY_PORTFOLIO_SUMMARY_MODEL_ID: "us.amazon.nova-micro-v1:0" },
    now: new Date("2026-08-01T12:00:00Z"),
  });
  assert.equal(commandInput.inferenceConfig.maxTokens, PORTFOLIO_NARRATIVE_MAX_TOKENS);
  assert.equal(commandInput.inferenceConfig.temperature, 0);
  assert.equal(narrative.status, "generated");
  assert.equal(narrative.inputTokens, 500);
  assert.equal(report.saves, 1);
});

test("invalid Bedrock output uses a deterministic non-AI narrative", async () => {
  assert.throws(() => parsePortfolioNarrative("not json"), /invalid/);
  const fallback = buildFallbackPortfolioNarrative({
    periodLabel: "July 2026",
    metrics: {
      managedPropertyCount: 2,
      propertiesWithSubmissionsCount: 0,
      propertiesWithoutSubmissions: ["One", "Two"],
      submissionCount: 0,
      reportableSubmissionCount: 0,
      inspectionsWithIssuesCount: 0,
      completedAssignmentCount: 0,
      incompleteScheduledCount: 0,
      issues: [],
    },
    comparison: { submissionCountDelta: 0, repeatIssueTypes: [] },
  });
  assert.match(fallback.executiveSummary, /no submitted inspections/i);
  assert.doesNotMatch(fallback.executiveSummary, /safe|resolved/i);
});
