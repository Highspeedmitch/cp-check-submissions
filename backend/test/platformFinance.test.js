const test = require("node:test");
const assert = require("node:assert/strict");
const {
  financialMonthRange,
  costAppliesToMonth,
  buildPlatformFinancialOverview,
} = require("../services/platformFinance");

test("financial month ranges are UTC calendar boundaries", () => {
  const range = financialMonthRange("2026-08");
  assert.equal(range.start.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.throws(() => financialMonthRange("August"), /valid financial month/i);
});

test("recurring and one-time costs apply to the selected month", () => {
  assert.equal(costAppliesToMonth({ startMonth: "2026-07", recurrence: "monthly" }, "2026-08"), true);
  assert.equal(costAppliesToMonth({ startMonth: "2026-07", recurrence: "one_time" }, "2026-08"), false);
  assert.equal(costAppliesToMonth({ startMonth: "2026-08", recurrence: "one_time" }, "2026-08"), true);
  assert.equal(costAppliesToMonth({
    startMonth: "2026-07",
    endMonth: "2026-08",
    recurrence: "monthly",
  }, "2026-09"), false);
  assert.equal(costAppliesToMonth({
    startMonth: "2026-08",
    recurrence: "one_time",
    archivedAt: new Date(),
  }, "2026-08"), false);
});

test("financial overview separates Afterlight revenue, contractor payouts, and internal work", () => {
  const overview = buildPlatformFinancialOverview({
    month: "2026-08",
    organizations: [{
      _id: "org-1",
      name: "PICOR",
      properties: [
        { name: "Legacy Center", defaultInspectionAmountCents: 19500 },
      ],
    }],
    assignments: [
      {
        _id: "scheduled-1",
        organizationId: "org-1",
        propertyName: "Commerce Center",
        startDate: "2026-08-10T00:00:00.000Z",
        status: "scheduled",
        fulfillment: {
          source: "afterlight_contractor",
          invoiceRouting: "afterlight_service_billing",
        },
        customerChargeSnapshot: {
          amountCents: 18000,
          snapshottedAt: "2026-07-01T00:00:00.000Z",
        },
        compensationSnapshot: { amountCents: 6000 },
      },
      {
        _id: "completed-1",
        organizationId: "org-1",
        propertyName: "Legacy Center",
        startDate: "2026-08-03T00:00:00.000Z",
        status: "completed",
        fulfillment: {
          source: "afterlight_contractor",
          invoiceRouting: "afterlight_service_billing",
        },
        compensationSnapshot: { amountCents: 6500 },
      },
      {
        _id: "internal-1",
        organizationId: "org-1",
        propertyName: "Internal Plaza",
        startDate: "2026-08-15T00:00:00.000Z",
        status: "completed",
        fulfillment: { source: "customer_employee", invoiceRouting: "none" },
      },
    ],
    invoices: [{ assignmentId: "completed-1", amountCents: 22000, status: "paid" }],
    earnings: [{
      assignmentId: "completed-1",
      status: "approved",
      grossAmountCents: 7000,
      reimbursementCents: 500,
    }],
    costs: [
      {
        _id: "cost-1",
        name: "AWS",
        startMonth: "2026-07",
        recurrence: "monthly",
        classification: "actual",
        amountCents: 3000,
      },
      {
        _id: "cost-2",
        name: "AI",
        startMonth: "2026-08",
        recurrence: "one_time",
        classification: "estimated",
        amountCents: 2000,
      },
      {
        _id: "cost-3",
        name: "Future",
        startMonth: "2026-09",
        recurrence: "one_time",
        classification: "estimated",
        amountCents: 9999,
      },
    ],
  });

  assert.deepEqual(overview.summary, {
    assignmentCount: 3,
    billableAssignmentCount: 2,
    internalAssignmentCount: 1,
    propertyCount: 3,
    scheduledAfterlightCount: 1,
    completedAfterlightCount: 1,
    projectedRevenueCents: 40000,
    earnedRevenueCents: 22000,
    paidRevenueCents: 22000,
    outstandingReceivableCents: 0,
    projectedPayoutCents: 13500,
    earnedPayoutCents: 7500,
    projectedOperatingCostCents: 5000,
    actualOperatingCostCents: 3000,
    projectedNetCents: 21500,
    earnedNetCents: 11500,
    missingCustomerRateCount: 0,
    missingPayoutRateCount: 0,
  });
  assert.equal(overview.organizations[0].projectedMarginCents, 26500);
  assert.equal(overview.assignments.find((row) => row.assignmentId === "internal-1").revenueSource, "not_billable");
  assert.equal(overview.costs.length, 2);
});

test("financial overview reports missing rates without estimating unsupported dollars", () => {
  const overview = buildPlatformFinancialOverview({
    month: "2026-08",
    organizations: [{ _id: "org-1", name: "No rates", properties: [] }],
    assignments: [{
      _id: "assignment-1",
      organizationId: "org-1",
      propertyName: "Unknown",
      startDate: "2026-08-10T00:00:00.000Z",
      status: "scheduled",
      fulfillment: {
        source: "afterlight_contractor",
        invoiceRouting: "afterlight_service_billing",
      },
      customerChargeSnapshot: { amountCents: null, snapshottedAt: new Date() },
      compensationSnapshot: { amountCents: null },
    }],
  });

  assert.equal(overview.summary.projectedRevenueCents, 0);
  assert.equal(overview.summary.projectedPayoutCents, 0);
  assert.equal(overview.summary.missingCustomerRateCount, 1);
  assert.equal(overview.summary.missingPayoutRateCount, 1);
});
