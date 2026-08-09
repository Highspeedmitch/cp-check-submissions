const express = require("express");
const mongoose = require("mongoose");
const Organization = require("../models/organization");
const Submission = require("../models/submission");
const User = require("../models/user");
const MonthlyPortfolioSummary = require("../models/monthlyPortfolioSummary");
const {
  MIN_SUBMISSION_MONTHS,
  MAX_SUBMISSION_MONTHS,
  parseSubmissionMonths,
  getSubmissionCutoff,
} = require("../utils/submissionRange");
const {
  reportingProperties,
  buildReportingSummary,
} = require("../services/reporting");
const {
  isMonthlyPortfolioSummaryOrganizationAllowed,
  monthlyPortfolioSummaryMode,
  periodForKey,
  previousMonthPeriod,
} = require("../services/monthlyPortfolioSummary");
const {
  enqueueMonthlyPortfolioSummary,
} = require("../services/monthlyPortfolioSummaryWorker");
const {
  downloadPortfolioSummaryPdf,
} = require("../services/portfolioSummaryStorage");
const { inlinePdfContentDisposition } = require("../services/inspectionStorage");

const router = express.Router();

router.get("/summary", async (req, res) => {
  try {
    if (!["admin", "property_manager"].includes(req.user.role)) {
      return res.status(403).json({ error: "Reporting is available to administrators and property managers." });
    }
    const months = parseSubmissionMonths(req.query.months);
    if (months === null) {
      return res.status(400).json({
        error: `Reporting range must be between ${MIN_SUBMISSION_MONTHS} and ${MAX_SUBMISSION_MONTHS} months.`,
      });
    }
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ error: "Organization not found." });

    const properties = reportingProperties(organization, req.user);
    const propertyId = req.query.propertyId || "";
    const selectedProperty = propertyId
      ? properties.find((property) => String(property._id) === String(propertyId))
      : null;
    if (propertyId && !selectedProperty) {
      return res.status(403).json({ error: "This property is outside your reporting scope." });
    }

    const selectedUserId = req.query.userId || "";
    if (selectedUserId && !mongoose.Types.ObjectId.isValid(selectedUserId)) {
      return res.status(400).json({ error: "Invalid field operator filter." });
    }

    const cutoff = getSubmissionCutoff(months);
    const submissions = await Submission.find({
      organizationId: req.user.organizationId,
      property: { $in: properties.map((property) => property.name) },
      submittedAt: { $gte: cutoff },
    }).select("userId property submittedAt responses templateSnapshot").lean();

    const userIds = [...new Set(submissions.map((submission) => String(submission.userId)))];
    if (selectedUserId && !userIds.includes(String(selectedUserId))) {
      return res.status(404).json({ error: "Field operator not found in this reporting scope." });
    }
    const users = await User.find({
      _id: { $in: userIds },
      organizationId: req.user.organizationId,
    }).select("username email").lean();

    return res.json(buildReportingSummary({
      submissions,
      users,
      properties,
      months,
      timezone: organization.reportingTimezone,
      selectedPropertyName: selectedProperty?.name || "",
      selectedUserId,
    }));
  } catch (error) {
    if (/whole number|between/i.test(error.message || "")) {
      return res.status(400).json({
        error: `Reporting range must be between ${MIN_SUBMISSION_MONTHS} and ${MAX_SUBMISSION_MONTHS} months.`,
      });
    }
    console.error("Reporting summary error:", error);
    return res.status(500).json({ error: "Unable to load reporting data." });
  }
});

function requireReportingRole(req, res) {
  if (["admin", "property_manager"].includes(req.user.role)) return true;
  res.status(403).json({ error: "Reporting is available to administrators and property managers." });
  return false;
}

function monthlySummaryQuery(req) {
  return {
    organizationId: req.user.organizationId,
    ...(req.user.role === "property_manager" ? { recipientUserId: req.user.userId } : {}),
  };
}

function serializeMonthlySummary(report) {
  return {
    _id: report._id,
    recipientUserId: report.recipientUserId,
    recipient: report.recipientSnapshot,
    periodKey: report.periodKey,
    periodLabel: report.periodLabel,
    reportingTimezone: report.reportingTimezone,
    status: report.status,
    mode: report.mode,
    metrics: report.metrics,
    comparison: report.comparison,
    narrative: report.narrative,
    propertyCount: report.propertySnapshots?.length || 0,
    emailSentAt: report.emailSentAt,
    emailError: report.emailError,
    completedAt: report.completedAt,
    lastError: report.lastError,
    downloadUrl: report.status === "completed" && report.pdfKey
      ? `/api/reporting/monthly-summaries/${report._id}/download`
      : null,
  };
}

router.get("/monthly-summaries", async (req, res) => {
  try {
    if (!requireReportingRole(req, res)) return;
    const mode = monthlyPortfolioSummaryMode();
    const [organization, reports] = await Promise.all([
      Organization.findById(req.user.organizationId).select("name"),
      MonthlyPortfolioSummary.find(monthlySummaryQuery(req))
        .sort({ periodStart: -1, "recipientSnapshot.name": 1 })
        .limit(36)
        .lean(),
    ]);
    const organizationAllowed = isMonthlyPortfolioSummaryOrganizationAllowed(organization);
    return res.json({
      feature: {
        mode,
        enabled: mode !== "off" && organizationAllowed,
        automaticEmailDelivery: mode === "live" && organizationAllowed,
      },
      items: reports.map(serializeMonthlySummary),
    });
  } catch (error) {
    console.error("Monthly portfolio summary list error:", error);
    return res.status(500).json({ error: "Unable to load monthly portfolio summaries." });
  }
});

router.post("/monthly-summaries", async (req, res) => {
  try {
    if (!requireReportingRole(req, res)) return;
    const mode = monthlyPortfolioSummaryMode();
    if (mode === "off") {
      return res.status(503).json({ error: "Monthly portfolio summaries are not enabled for this deployment." });
    }
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ error: "Organization not found." });
    if (!isMonthlyPortfolioSummaryOrganizationAllowed(organization)) {
      return res.status(403).json({ error: "This organization is not enabled for monthly portfolio summaries." });
    }

    const requestedRecipientId = req.user.role === "admin" && req.body?.recipientUserId
      ? req.body.recipientUserId
      : req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(requestedRecipientId)) {
      return res.status(400).json({ error: "Invalid monthly summary recipient." });
    }
    const recipient = await User.findOne({
      _id: requestedRecipientId,
      organizationId: req.user.organizationId,
      role: { $in: ["admin", "property_manager"] },
      accountStatus: { $ne: "inactive" },
      organizationArchivedAt: null,
    });
    if (!recipient) return res.status(404).json({ error: "Monthly summary recipient not found." });

    let period;
    try {
      period = req.body?.periodKey
        ? periodForKey(String(req.body.periodKey), organization.reportingTimezone)
        : previousMonthPeriod(organization.reportingTimezone);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const latestCompletedPeriod = previousMonthPeriod(organization.reportingTimezone);
    if (period.end > latestCompletedPeriod.end) {
      return res.status(400).json({ error: "Monthly summaries can only be generated for completed months." });
    }

    let report = await enqueueMonthlyPortfolioSummary({
      organization,
      recipient,
      period,
      mode,
    });
    if (!report) {
      return res.status(400).json({ error: "The selected recipient does not manage any properties." });
    }
    if (report.status === "failed") {
      report.status = "queued";
      report.attempts = 0;
      report.availableAt = new Date();
      report.failedAt = null;
      report.lastError = "";
      await report.save();
    }
    return res.status(202).json(serializeMonthlySummary(report));
  } catch (error) {
    console.error("Monthly portfolio summary enqueue error:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ error: "This monthly portfolio summary is already being prepared." });
    }
    return res.status(500).json({ error: "Unable to prepare the monthly portfolio summary." });
  }
});

router.get("/monthly-summaries/:summaryId/download", async (req, res) => {
  try {
    if (!requireReportingRole(req, res)) return;
    if (!mongoose.Types.ObjectId.isValid(req.params.summaryId)) {
      return res.status(400).json({ error: "Invalid monthly portfolio summary." });
    }
    const report = await MonthlyPortfolioSummary.findOne({
      _id: req.params.summaryId,
      ...monthlySummaryQuery(req),
    });
    if (!report) return res.status(404).json({ error: "Monthly portfolio summary not found." });
    if (report.status !== "completed" || !report.pdfKey) {
      return res.status(409).json({ error: "The monthly portfolio PDF is not ready yet." });
    }
    const pdf = await downloadPortfolioSummaryPdf(report.pdfKey);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": inlinePdfContentDisposition(report.pdfFileName),
      "Cache-Control": "private, no-store",
    });
    return res.send(pdf);
  } catch (error) {
    console.error("Monthly portfolio summary download error:", error);
    return res.status(500).json({ error: "Unable to download the monthly portfolio summary." });
  }
});

module.exports = router;
module.exports.monthlySummaryQuery = monthlySummaryQuery;
module.exports.serializeMonthlySummary = serializeMonthlySummary;
