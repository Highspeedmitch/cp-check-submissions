const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildMonthlyAssignmentCoverage,
  currentAssignmentMonth,
} = require("../services/monthlyAssignmentCoverage");

test("current assignment month follows the organization timezone while retaining logical UTC dates", () => {
  const beforePhoenixMidnight = currentAssignmentMonth(
    "America/Phoenix",
    new Date("2026-08-01T06:30:00.000Z")
  );
  assert.equal(beforePhoenixMidnight.key, "2026-07");
  assert.equal(beforePhoenixMidnight.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(beforePhoenixMidnight.end.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(beforePhoenixMidnight.todayStart.toISOString(), "2026-07-31T00:00:00.000Z");

  const afterPhoenixMidnight = currentAssignmentMonth(
    "America/Phoenix",
    new Date("2026-08-01T07:30:00.000Z")
  );
  assert.equal(afterPhoenixMidnight.key, "2026-08");
  assert.equal(afterPhoenixMidnight.monthName, "August");
});

test("monthly coverage derives unscheduled, scheduled, completed, and missed property states", () => {
  const period = currentAssignmentMonth(
    "America/Phoenix",
    new Date("2026-08-09T15:00:00.000Z")
  );
  const coverage = buildMonthlyAssignmentCoverage({
    period,
    properties: [
      { _id: "property-1", name: "Upcoming" },
      { _id: "property-2", name: "Finished" },
      { _id: "property-3", name: "Past Due" },
      { _id: "property-4", name: "Canceled Only" },
      { _id: "property-5", name: "More Work" },
    ],
    assignments: [
      { propertyName: "Upcoming", status: "scheduled", startDate: "2026-08-14T00:00:00.000Z", endDate: "2026-08-14T00:00:00.000Z" },
      { propertyName: "Finished", status: "completed", startDate: "2026-08-04T00:00:00.000Z", endDate: "2026-08-04T00:00:00.000Z" },
      { propertyName: "Past Due", status: "scheduled", startDate: "2026-08-08T00:00:00.000Z", endDate: "2026-08-08T00:00:00.000Z" },
      { propertyName: "Canceled Only", status: "canceled", startDate: "2026-08-05T00:00:00.000Z", endDate: "2026-08-05T00:00:00.000Z" },
      { propertyName: "More Work", status: "completed", startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-08-01T00:00:00.000Z" },
      { propertyName: "More Work", status: "scheduled", startDate: "2026-08-20T00:00:00.000Z", endDate: "2026-08-20T00:00:00.000Z" },
      { propertyName: "Upcoming", status: "completed", startDate: "2026-07-10T00:00:00.000Z", endDate: "2026-07-10T00:00:00.000Z" },
    ],
  });

  assert.deepEqual(
    coverage.properties.map(({ propertyName, status }) => ({ propertyName, status })),
    [
      { propertyName: "Upcoming", status: "scheduled" },
      { propertyName: "Finished", status: "completed" },
      { propertyName: "Past Due", status: "missed" },
      { propertyName: "Canceled Only", status: "unscheduled" },
      { propertyName: "More Work", status: "scheduled" },
    ]
  );
  assert.equal(coverage.summary.scheduledPropertyCount, 4);
  assert.equal(coverage.summary.totalPropertyCount, 5);
  assert.deepEqual(coverage.summary.statusCounts, {
    unscheduled: 1,
    scheduled: 2,
    completed: 1,
    missed: 1,
  });
});

test("a scheduled assignment is not missed until the day after its inclusive end date", () => {
  const period = currentAssignmentMonth(
    "America/Phoenix",
    new Date("2026-08-08T18:00:00.000Z")
  );
  const coverage = buildMonthlyAssignmentCoverage({
    period,
    properties: [{ _id: "property-1", name: "Due Today" }],
    assignments: [{
      propertyName: "Due Today",
      status: "scheduled",
      startDate: "2026-08-08T00:00:00.000Z",
      endDate: "2026-08-08T00:00:00.000Z",
    }],
  });

  assert.equal(coverage.properties[0].status, "scheduled");
});
