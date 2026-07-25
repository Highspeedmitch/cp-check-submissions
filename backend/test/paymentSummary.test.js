const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getPaymentSummary,
  parsePaymentRates,
  calculatePaymentTotal,
} = require("../services/paymentSummary");

function leanQuery(value) {
  return {
    select() { return this; },
    session() { return this; },
    lean: async () => value,
  };
}

function countQuery(value, capture, key) {
  return {
    session() { return this; },
    then(resolve) {
      capture[key] = true;
      return Promise.resolve(value).then(resolve);
    },
  };
}

test("payment summary scopes operational counts to the authenticated organization", async () => {
  const captured = {};
  const summary = await getPaymentSummary({
    organizationId: "org-1",
    userId: "user-1",
    models: {
      User: {
        findOne(query) {
          captured.user = query;
          return leanQuery({
            _id: "user-1",
            lastPaidDate: new Date("2026-07-01T00:00:00Z"),
          });
        },
      },
      Submission: {
        countDocuments(query) {
          captured.submissions = query;
          return countQuery(3, captured, "submissionsExecuted");
        },
      },
      Assignment: {
        countDocuments(query) {
          captured.assignments = query;
          return countQuery(4, captured, "assignmentsExecuted");
        },
      },
      MileageTracking: {
        findOne(query) {
          captured.mileage = query;
          return leanQuery({ totalMiles: 12.5, history: [] });
        },
      },
      Payment: {
        find() {
          return leanQuery([{ amount: 100 }, { amount: 50 }]);
        },
      },
    },
  });

  assert.equal(captured.user.organizationId, "org-1");
  assert.equal(captured.submissions.organizationId, "org-1");
  assert.equal(captured.assignments.organizationId, "org-1");
  assert.equal(captured.mileage.organizationId, "org-1");
  assert.equal(captured.submissionsExecuted, true);
  assert.equal(captured.assignmentsExecuted, true);
  assert.equal(summary.submissionCount, 3);
  assert.equal(summary.assignmentCount, 4);
  assert.equal(summary.currentMiles, 12.5);
  assert.equal(summary.ytdPayments, 150);
});

test("payment total is calculated from server summary values", () => {
  const rates = parsePaymentRates({
    perSubmissionRate: "25",
    perMileRate: "0.50",
  });

  assert.deepEqual(rates, { perSubmissionRate: 25, perMileRate: 0.5 });
  assert.equal(calculatePaymentTotal({
    submissionCount: 3,
    currentMiles: 12.5,
  }, rates), 81.25);
  assert.equal(parsePaymentRates({ perSubmissionRate: -1, perMileRate: 0.5 }), null);
});
