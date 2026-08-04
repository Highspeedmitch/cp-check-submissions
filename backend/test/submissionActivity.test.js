const test = require("node:test");
const assert = require("node:assert/strict");
const { withSubmissionActivity } = require("../Routes/submissions");

test("submission activity includes submitter and assignment attribution", () => {
  const submission = {
    _id: "submission-1",
    userId: "submitter-1",
    assignmentId: "assignment-1",
    pdfUrl: "https://example.com/report.pdf",
    submittedAt: new Date("2026-08-03T18:30:00.000Z"),
  };
  const assignment = {
    _id: "assignment-1",
    startDate: new Date("2026-08-03T16:00:00.000Z"),
    createdAt: new Date("2026-08-01T16:00:00.000Z"),
    assignedBy: null,
    fulfillment: {
      source: "afterlight_contractor",
      resolvedBy: "admin-1",
    },
    compensationSnapshot: { amountCents: 9000, currency: "USD" },
  };
  const usersById = new Map([
    ["submitter-1", { _id: "submitter-1", username: "Inspector One", email: "inspector@example.com" }],
    ["admin-1", { _id: "admin-1", username: "Admin One", email: "admin@example.com" }],
  ]);

  const result = withSubmissionActivity(
    submission,
    assignment,
    usersById,
    { replacePlus: true },
    () => "https://signed.example.com/report.pdf"
  );

  assert.equal(result.signedPdfUrl, "https://signed.example.com/report.pdf");
  assert.deepEqual(result.submittedBy, {
    _id: "submitter-1",
    name: "Inspector One",
    email: "inspector@example.com",
  });
  assert.deepEqual(result.assignment, {
    _id: "assignment-1",
    scheduledAt: assignment.startDate,
    assignedAt: assignment.createdAt,
    assignedBy: {
      _id: "admin-1",
      name: "Admin One",
      email: "admin@example.com",
    },
    fulfillmentType: "afterlight_contractor",
  });
  assert.equal(result.assignment.compensationSnapshot, undefined);
});
