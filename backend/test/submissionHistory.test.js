const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SUBMISSION_HISTORY_PAGE_SIZE,
  parseSubmissionHistoryQuery,
  buildSubmissionHistoryPipeline,
} = require("../Routes/submissions");

const ORGANIZATION_ID = "507f1f77bcf86cd799439011";
const SUBMITTER_ID = "507f1f77bcf86cd799439012";
const ASSIGNER_ID = "507f1f77bcf86cd799439013";

test("submission history uses a ten-record page", () => {
  assert.equal(SUBMISSION_HISTORY_PAGE_SIZE, 10);
});

test("submission history query parsing validates every server-side filter", () => {
  assert.deepEqual(parseSubmissionHistoryQuery({
    months: "12",
    page: "2",
    submitter: SUBMITTER_ID,
    assigner: ASSIGNER_ID,
    fulfillment: "afterlight_staff",
  }), {
    months: 12,
    page: 2,
    paginated: true,
    submitter: SUBMITTER_ID,
    assigner: ASSIGNER_ID,
    fulfillment: "afterlight_staff",
  });
  assert.equal(parseSubmissionHistoryQuery({ months: "12" }).paginated, false);
  assert.equal(parseSubmissionHistoryQuery({ assigner: "unassigned" }).assigner, "unassigned");
  assert.throws(() => parseSubmissionHistoryQuery({ page: "0" }), /positive whole number/);
  assert.throws(() => parseSubmissionHistoryQuery({ submitter: "not-an-id" }), /valid user ID/);
  assert.throws(() => parseSubmissionHistoryQuery({ fulfillment: "internal_rate" }), /supported filter/);
});

test("legacy submission history requests remain unpaginated", () => {
  const pipeline = buildSubmissionHistoryPipeline({
    organizationId: ORGANIZATION_ID,
    property: "Winterhaven Square",
    cutoff: new Date("2025-08-04T12:00:00.000Z"),
    page: 1,
    paginated: false,
    assignmentCollection: "assignments",
  });
  const rows = pipeline.at(-1).$facet.rows;

  assert.equal(rows.some((stage) => Object.hasOwn(stage, "$skip")), false);
  assert.equal(rows.some((stage) => Object.hasOwn(stage, "$limit")), false);
  assert.deepEqual(rows[1], { $sort: { submittedAt: -1, _id: -1 } });
});

test("submission filters and total count run before pagination", () => {
  const cutoff = new Date("2025-08-04T12:00:00.000Z");
  const pipeline = buildSubmissionHistoryPipeline({
    organizationId: ORGANIZATION_ID,
    property: "Winterhaven Square",
    cutoff,
    page: 2,
    submitter: SUBMITTER_ID,
    assigner: ASSIGNER_ID,
    fulfillment: "afterlight_staff",
    assignmentCollection: "assignments",
  });
  const baseMatch = pipeline[0].$match;
  const facet = pipeline.at(-1).$facet;
  const resultMatch = facet.rows[0].$match;

  assert.equal(String(baseMatch.organizationId), ORGANIZATION_ID);
  assert.equal(baseMatch.property, "Winterhaven Square");
  assert.equal(baseMatch.submittedAt.$gte, cutoff);
  assert.equal(String(resultMatch.userId), SUBMITTER_ID);
  assert.equal(String(resultMatch.historyAssignerId), ASSIGNER_ID);
  assert.equal(resultMatch.historyFulfillment, "afterlight_staff");
  assert.deepEqual(facet.total[0], { $match: resultMatch });
  assert.deepEqual(facet.total[1], { $count: "count" });
  assert.deepEqual(facet.rows[2], { $skip: 10 });
  assert.deepEqual(facet.rows[3], { $limit: 10 });
  assert.deepEqual(facet.submitters, [{ $group: { _id: "$userId" } }]);
});
