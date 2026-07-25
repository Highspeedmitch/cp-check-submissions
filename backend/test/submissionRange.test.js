const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseSubmissionMonths,
  getSubmissionCutoff,
} = require("../utils/submissionRange");

test("submission range defaults to 12 months", () => {
  assert.equal(parseSubmissionMonths(undefined), 12);
  assert.equal(parseSubmissionMonths(""), 12);
});

test("submission range accepts whole months from 1 through 18", () => {
  assert.equal(parseSubmissionMonths("1"), 1);
  assert.equal(parseSubmissionMonths("12"), 12);
  assert.equal(parseSubmissionMonths("18"), 18);
});

test("submission range rejects unsupported values", () => {
  for (const value of ["0", "19", "1.5", "all", "-1"]) {
    assert.equal(parseSubmissionMonths(value), null);
  }
});

test("submission cutoff safely handles month-end dates", () => {
  const cutoff = getSubmissionCutoff(1, new Date(2026, 2, 31, 10, 30));

  assert.equal(cutoff.getFullYear(), 2026);
  assert.equal(cutoff.getMonth(), 1);
  assert.equal(cutoff.getDate(), 28);
  assert.equal(cutoff.getHours(), 10);
  assert.equal(cutoff.getMinutes(), 30);
});
