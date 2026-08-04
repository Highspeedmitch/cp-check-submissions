const User = require("../models/user");
const Submission = require("../models/submission");
const Assignment = require("../models/assignment");
const MileageTracking = require("../models/mileageTracking");
const Payment = require("../models/Payment");

function queryWithSession(query, session) {
  return session ? query.session(session) : query;
}

async function getPaymentSummary({
  organizationId,
  userId,
  session,
  models = { User, Submission, Assignment, MileageTracking, Payment },
}) {
  const userQuery = models.User.findOne({
    _id: userId,
    organizationId,
    role: "user",
    organizationArchivedAt: null,
  }).select("username lastPaidDate");
  const user = await queryWithSession(userQuery, session).lean();
  if (!user) return null;

  const since = user.lastPaidDate || new Date(0);
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);
  const submissionQuery = {
    organizationId,
    userId,
    submittedAt: { $gt: since },
  };
  const assignmentQuery = {
    organizationId,
    userId,
    startDate: { $gt: since },
  };
  const mileageQuery = models.MileageTracking.findOne({
    organizationId,
    userId,
  }).select("totalMiles history");
  const paymentsQuery = models.Payment.find({
    userId,
    paidAt: { $gte: startOfYear },
  }).select("amount");

  const [submissionCount, assignmentCount, mileageRecord, payments] = await Promise.all([
    queryWithSession(models.Submission.countDocuments(submissionQuery), session),
    queryWithSession(models.Assignment.countDocuments(assignmentQuery), session),
    queryWithSession(mileageQuery, session).lean(),
    queryWithSession(paymentsQuery, session).lean(),
  ]);

  const ytdMiles = (mileageRecord?.history || []).reduce((total, entry) => {
    return entry.paidDate && new Date(entry.paidDate) >= startOfYear
      ? total + (Number(entry.milesPaid) || 0)
      : total;
  }, 0);

  return {
    user,
    submissionCount,
    assignmentCount,
    currentMiles: Number(mileageRecord?.totalMiles) || 0,
    ytdMiles,
    ytdPayments: payments.reduce((total, payment) => total + payment.amount, 0),
    lastPaidDate: user.lastPaidDate || null,
  };
}

function parsePaymentRates(body) {
  const perSubmissionRate = Number(body.perSubmissionRate);
  const perMileRate = Number(body.perMileRate);
  if (
    !Number.isFinite(perSubmissionRate) ||
    !Number.isFinite(perMileRate) ||
    perSubmissionRate < 0 ||
    perMileRate < 0
  ) {
    return null;
  }
  return { perSubmissionRate, perMileRate };
}

function calculatePaymentTotal(summary, rates) {
  return Math.round((
    summary.submissionCount * rates.perSubmissionRate +
    summary.currentMiles * rates.perMileRate
  ) * 100) / 100;
}

module.exports = {
  getPaymentSummary,
  parsePaymentRates,
  calculatePaymentTotal,
};
