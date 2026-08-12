const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildOrganizationWarRoom,
  currentOperationalWeek,
  getPlatformWarRoom,
} = require("../services/platformWarRoom");

const NOW = new Date("2026-08-11T18:00:00.000Z");

function organization(overrides = {}) {
  return {
    _id: "org-1",
    name: "PICOR",
    serviceModel: "managed",
    reportingTimezone: "America/Phoenix",
    properties: [
      { _id: "property-1", name: "Spanish Trail Plaza" },
      { _id: "property-2", name: "Broadway Center" },
    ],
    ...overrides,
  };
}

function assignment(overrides = {}) {
  return {
    organizationId: "org-1",
    propertyId: "property-1",
    propertyName: "Spanish Trail Plaza",
    startDate: new Date("2026-08-10T00:00:00.000Z"),
    endDate: new Date("2026-08-10T00:00:00.000Z"),
    status: "completed",
    fulfillment: { queue: "afterlight_coverage" },
    ...overrides,
  };
}

function queryResult(value) {
  return {
    select() { return this; },
    async lean() { return value; },
  };
}

test("operational weeks run Monday through Sunday in the reporting timezone", () => {
  const week = currentOperationalWeek("America/Phoenix", NOW);
  assert.equal(week.key, "2026-08-10");
  assert.equal(week.label, "Aug 10 - Aug 16");
  assert.equal(week.start.toISOString(), "2026-08-10T00:00:00.000Z");
  assert.equal(week.end.toISOString(), "2026-08-17T00:00:00.000Z");
});

test("managed organizations are on track when every property is completed or scheduled and nothing is missed", () => {
  const row = buildOrganizationWarRoom({
    organization: organization(),
    assignments: [
      assignment(),
      assignment({
        propertyId: "property-2",
        propertyName: "Broadway Center",
        startDate: new Date("2026-08-14T00:00:00.000Z"),
        endDate: new Date("2026-08-14T00:00:00.000Z"),
        status: "scheduled",
      }),
    ],
    now: NOW,
  });

  assert.equal(row.status, "on_track");
  assert.equal(row.month.coveredPropertyCount, 2);
  assert.equal(row.month.completedPropertyCount, 1);
  assert.deepEqual(row.week, {
    key: "2026-08-10",
    label: "Aug 10 - Aug 16",
    dueAssignmentCount: 2,
    completedAssignmentCount: 1,
    remainingAssignmentCount: 1,
    overdueAssignmentCount: 0,
  });
});

test("missed scheduled work places an organization behind", () => {
  const row = buildOrganizationWarRoom({
    organization: organization(),
    assignments: [
      assignment({ status: "scheduled" }),
      assignment({
        propertyId: "property-2",
        propertyName: "Broadway Center",
        startDate: new Date("2026-08-14T00:00:00.000Z"),
        endDate: new Date("2026-08-14T00:00:00.000Z"),
        status: "scheduled",
      }),
    ],
    now: NOW,
  });

  assert.equal(row.status, "behind");
  assert.equal(row.month.missedPropertyCount, 1);
  assert.match(row.statusReasons[0], /missed its scheduled work/i);
});

test("Hybrid portfolio coverage uses unique properties and the licensed tier minimum", () => {
  const properties = Array.from({ length: 10 }, (_, index) => ({
    _id: `property-${index + 1}`,
    name: `Property ${index + 1}`,
  }));
  const assignments = properties.map((property, index) => assignment({
    propertyId: property._id,
    propertyName: property.name,
    startDate: new Date(`2026-08-${String(index + 12).padStart(2, "0")}T00:00:00.000Z`),
    endDate: new Date(`2026-08-${String(index + 12).padStart(2, "0")}T00:00:00.000Z`),
    status: "scheduled",
    fulfillment: { queue: index === 0 ? "afterlight_coverage" : "customer_assigned" },
  }));
  assignments.push({ ...assignments[0], startDate: new Date("2026-08-25T00:00:00.000Z") });

  const row = buildOrganizationWarRoom({
    organization: organization({
      serviceModel: "hybrid",
      license: { tier: "tier_1" },
      properties,
    }),
    assignments,
    now: NOW,
  });

  assert.equal(row.status, "at_risk");
  assert.deepEqual(row.hybridCoverage, {
    assignedPropertyCount: 1,
    requiredAssignedPropertyCount: 2,
    totalPropertyCount: 10,
    actualPercent: 10,
    minimumPercent: 15,
    meetsMinimum: false,
  });
  assert.match(row.statusReasons[0], /10%.*15%/);
});

test("Hybrid minimums use the required property count instead of rounded display percentages", () => {
  const properties = Array.from({ length: 201 }, (_, index) => ({
    _id: `property-${index + 1}`,
    name: `Property ${index + 1}`,
  }));
  const assignments = properties.map((property, index) => assignment({
    propertyId: property._id,
    propertyName: property.name,
    startDate: new Date("2026-08-20T00:00:00.000Z"),
    endDate: new Date("2026-08-20T00:00:00.000Z"),
    status: "scheduled",
    fulfillment: { queue: index < 20 ? "afterlight_coverage" : "customer_assigned" },
  }));

  const row = buildOrganizationWarRoom({
    organization: organization({
      serviceModel: "hybrid",
      license: { tier: "tier_3" },
      properties,
    }),
    assignments,
    now: NOW,
  });

  assert.equal(row.hybridCoverage.actualPercent, 10);
  assert.equal(row.hybridCoverage.requiredAssignedPropertyCount, 21);
  assert.equal(row.hybridCoverage.meetsMinimum, false);
  assert.equal(row.status, "at_risk");
});

test("War Room excludes retained organizations without active memberships and summarizes active portfolios", async () => {
  let membershipPipeline;
  const organizations = [
    organization(),
    organization({ _id: "org-historical", name: "Historical Client" }),
  ];
  const result = await getPlatformWarRoom({
    now: NOW,
    OrganizationModel: {
      find(query) {
        assert.deepEqual(query.serviceModel.$in, ["managed", "hybrid"]);
        return queryResult(organizations);
      },
    },
    UserModel: {
      async aggregate(pipeline) {
        membershipPipeline = pipeline;
        return [{ _id: "org-1" }];
      },
    },
    AssignmentModel: {
      find() {
        return queryResult([
          assignment(),
          assignment({
            propertyId: "property-2",
            propertyName: "Broadway Center",
            startDate: new Date("2026-08-14T00:00:00.000Z"),
            endDate: new Date("2026-08-14T00:00:00.000Z"),
            status: "scheduled",
          }),
        ]);
      },
    },
  });

  assert.equal(result.summary.organizationCount, 1);
  assert.equal(result.summary.onTrackCount, 1);
  assert.equal(result.summary.coveredPropertyCount, 2);
  assert.equal(result.organizations[0].name, "PICOR");
  assert.deepEqual(membershipPipeline[0].$match.organizationId.$in, ["org-1", "org-historical"]);
});
