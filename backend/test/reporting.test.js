const test = require("node:test");
const assert = require("node:assert/strict");
const {
  reportingProperties,
  submissionIssueOccurrences,
  averageMinuteOfDay,
  buildReportingSummary,
} = require("../services/reporting");

function submission({
  userId = "user-1",
  property = "Broadway Center",
  submittedAt,
  responses = {},
  fields,
}) {
  return {
    userId,
    property,
    submittedAt,
    responses,
    templateSnapshot: fields ? { fields } : null,
  };
}

test("property managers only report on explicitly managed properties", () => {
  const organization = {
    properties: [
      { name: "Broadway Center", propertyManagers: ["pm-1"] },
      { name: "San Clemente", propertyManagers: ["pm-2"] },
    ],
  };
  const properties = reportingProperties(organization, {
    role: "property_manager",
    userId: "pm-1",
  });
  assert.deepEqual(properties.map((property) => property.name), ["Broadway Center"]);
});

test("issue reporting counts only yes responses for issue fields", () => {
  const occurrences = submissionIssueOccurrences(submission({
    submittedAt: "2026-07-01T04:00:00.000Z",
    responses: {
      lights: "yes",
      curbs: "no",
      additionalComments: "Routine note",
    },
    fields: [
      { key: "lights", label: "Lights", reportLabel: "Exterior Lighting", type: "yes_no_issue" },
      { key: "curbs", label: "Curbs", type: "yes_no_issue" },
      { key: "additionalComments", label: "Comments", type: "textarea" },
    ],
  }));
  assert.deepEqual(occurrences, [{
    key: "lights",
    label: "Exterior Lighting",
  }]);
});

test("average submission time uses the reporting timezone and handles midnight", () => {
  const minute = averageMinuteOfDay([
    "2026-07-01T06:50:00.000Z",
    "2026-07-01T07:10:00.000Z",
  ], "America/Phoenix");
  assert.ok(minute === 0 || minute === 1440);
});

test("reporting summary applies property and submitter filters", () => {
  const fields = [
    { key: "lights", label: "Exterior Lighting", type: "yes_no_issue" },
    { key: "curbs", label: "Broken Curbs", type: "yes_no_issue" },
  ];
  const report = buildReportingSummary({
    submissions: [
      submission({
        userId: "user-1",
        submittedAt: "2026-07-20T04:15:00.000Z",
        responses: { lights: "yes", curbs: "yes" },
        fields,
      }),
      submission({
        userId: "user-2",
        property: "San Clemente",
        submittedAt: "2026-07-21T04:30:00.000Z",
        responses: { lights: "no", curbs: "yes" },
        fields,
      }),
    ],
    users: [
      { _id: "user-1", username: "Mitch" },
      { _id: "user-2", username: "Alex" },
    ],
    properties: [
      { _id: "property-1", name: "Broadway Center" },
      { _id: "property-2", name: "San Clemente" },
    ],
    months: 12,
    timezone: "America/Phoenix",
    selectedPropertyName: "Broadway Center",
    selectedUserId: "user-1",
    now: "2026-07-25T12:00:00.000Z",
  });

  assert.equal(report.summary.submissionCount, 1);
  assert.equal(report.summary.issuesPerInspection, 2);
  assert.equal(report.summary.distinctIssueTypes, 2);
  assert.equal(report.submitters.length, 1);
  assert.equal(report.submitters[0].name, "Mitch");
  assert.deepEqual(report.issues.map((issue) => issue.label), [
    "Broken Curbs",
    "Exterior Lighting",
  ]);
  assert.equal(report.filterOptions.users.length, 2);
});
