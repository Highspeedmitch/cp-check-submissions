const os = require("os");
const Assignment = require("../models/assignment");
const MonthlyPortfolioSummary = require("../models/monthlyPortfolioSummary");
const Organization = require("../models/organization");
const Submission = require("../models/submission");
const User = require("../models/user");
const { generateMonthlyPortfolioSummaryPDF } = require("../portfolioSummaryPdfService");
const {
  buildPortfolioComparison,
  buildPortfolioMetrics,
  ensurePortfolioNarrative,
  isMonthlyPortfolioSummaryOrganizationAllowed,
  monthlyPortfolioSummaryMode,
  portfolioPropertySnapshots,
  previousMonthPeriod,
  priorPeriod,
  propertiesForPortfolioRecipient,
} = require("./monthlyPortfolioSummary");
const {
  downloadPortfolioSummaryPdf,
  uploadPortfolioSummaryPdf,
} = require("./portfolioSummaryStorage");
const { sendSystemEmail } = require("./systemEmail");
const { sendUserNotification } = require("./notifications");
const { monthlyPortfolioSummaryReady } = require("./notificationEvents");
const { serviceModelIncludesPortfolioReporting } = require("./boutiquePolicy");

const DEFAULT_POLL_MS = 5000;
const SEED_INTERVAL_MS = 60 * 60 * 1000;
const LEASE_MS = 20 * 60 * 1000;

function workerId() {
  return `${os.hostname()}:${process.pid}:monthly-portfolio`;
}

async function enqueueMonthlyPortfolioSummary({
  organization,
  recipient,
  period = previousMonthPeriod(organization.reportingTimezone),
  mode = monthlyPortfolioSummaryMode(),
  ReportModel = MonthlyPortfolioSummary,
}) {
  if (!organization || !recipient) throw new Error("Organization and recipient are required.");
  if (!serviceModelIncludesPortfolioReporting(organization)) {
    const error = new Error("Monthly portfolio summaries are not included with this service model.");
    error.code = "REPORTING_NOT_INCLUDED";
    throw error;
  }
  if (!["preview", "live"].includes(mode)) throw new Error("Monthly portfolio summaries are not enabled.");
  const properties = propertiesForPortfolioRecipient(organization, recipient);
  if (!properties.length) return null;
  const recipientName = recipient.username || recipient.email;
  return ReportModel.findOneAndUpdate({
    organizationId: organization._id,
    recipientUserId: recipient._id,
    periodKey: period.key,
  }, {
    $setOnInsert: {
      organizationId: organization._id,
      recipientUserId: recipient._id,
      recipientSnapshot: {
        name: recipientName,
        email: recipient.email,
        role: recipient.role,
      },
      organizationName: organization.name,
      reportingTimezone: period.timezone,
      periodKey: period.key,
      periodLabel: period.label,
      periodStart: period.start,
      periodEnd: period.end,
      propertySnapshots: portfolioPropertySnapshots(properties),
      mode,
      status: "queued",
      availableAt: new Date(),
    },
  }, { new: true, upsert: true, setDefaultsOnInsert: true });
}

async function seedMonthlyPortfolioSummaries({
  env = process.env,
  now = new Date(),
  OrganizationModel = Organization,
  UserModel = User,
  ReportModel = MonthlyPortfolioSummary,
} = {}) {
  const mode = monthlyPortfolioSummaryMode(env);
  if (mode === "off") return { organizations: 0, recipients: 0, reports: 0 };
  const organizations = await OrganizationModel.find({
    workspaceType: "customer",
    orgType: "COM",
  });
  let recipientCount = 0;
  let reportCount = 0;
  for (const organization of organizations) {
    if (!isMonthlyPortfolioSummaryOrganizationAllowed(organization, env)) continue;
    const recipients = await UserModel.find({
      organizationId: organization._id,
      role: "property_manager",
      accountStatus: { $ne: "inactive" },
      organizationArchivedAt: null,
    }).select("username email role");
    recipientCount += recipients.length;
    const period = previousMonthPeriod(organization.reportingTimezone, now);
    for (const recipient of recipients) {
      const report = await enqueueMonthlyPortfolioSummary({
        organization,
        recipient,
        period,
        mode,
        ReportModel,
      });
      if (report) reportCount += 1;
    }
  }
  return {
    organizations: organizations.length,
    recipients: recipientCount,
    reports: reportCount,
  };
}

async function claimMonthlyPortfolioSummary({
  ReportModel = MonthlyPortfolioSummary,
  now = new Date(),
  id = workerId(),
} = {}) {
  const staleLease = new Date(now.getTime() - LEASE_MS);
  return ReportModel.findOneAndUpdate({
    $or: [
      { status: "queued", availableAt: { $lte: now } },
      { status: "processing", lockedAt: { $lte: staleLease } },
    ],
  }, {
    $set: { status: "processing", lockedAt: now, lockedBy: id, lastError: "" },
    $inc: { attempts: 1 },
  }, {
    new: true,
    sort: { availableAt: 1, createdAt: 1 },
  });
}

async function periodRecords(report, period, {
  SubmissionModel = Submission,
  AssignmentModel = Assignment,
} = {}) {
  const propertyNames = report.propertySnapshots.map((property) => property.name);
  const [submissions, assignments] = await Promise.all([
    SubmissionModel.find({
      organizationId: report.organizationId,
      property: { $in: propertyNames },
      submittedAt: { $gte: period.start, $lt: period.end },
    }).select("userId property submittedAt responses templateSnapshot assignmentId").lean(),
    AssignmentModel.find({
      organizationId: report.organizationId,
      propertyName: { $in: propertyNames },
      startDate: { $gte: period.start, $lt: period.end },
    }).select("userId propertyName startDate status completedAt").lean(),
  ]);
  return { submissions, assignments };
}

async function ensurePortfolioMetrics(report, dependencies = {}) {
  if (report.metrics && report.previousMetrics && report.comparison) {
    return {
      metrics: report.metrics,
      previousMetrics: report.previousMetrics,
      comparison: report.comparison,
    };
  }
  const currentPeriod = {
    start: report.periodStart,
    end: report.periodEnd,
  };
  const previousPeriod = priorPeriod(currentPeriod, report.reportingTimezone);
  const [current, previous] = await Promise.all([
    periodRecords(report, currentPeriod, dependencies),
    periodRecords(report, previousPeriod, dependencies),
  ]);
  const userIds = [...new Set([
    ...current.submissions,
    ...previous.submissions,
  ].map((submission) => String(submission.userId)).filter(Boolean))];
  const UserModel = dependencies.UserModel || User;
  const users = userIds.length
    ? await UserModel.find({
        _id: { $in: userIds },
        organizationId: report.organizationId,
      }).select("username email").lean()
    : [];
  const properties = report.propertySnapshots.map((property) => ({
    propertyId: property.propertyId,
    name: property.name,
  }));
  report.metrics = buildPortfolioMetrics({ ...current, properties, users });
  report.previousMetrics = buildPortfolioMetrics({ ...previous, properties, users });
  report.comparison = buildPortfolioComparison(report.metrics, report.previousMetrics);
  await report.save();
  return {
    metrics: report.metrics,
    previousMetrics: report.previousMetrics,
    comparison: report.comparison,
  };
}

async function ensurePortfolioPdf(report, dependencies = {}) {
  const downloadPdf = dependencies.downloadPdf || downloadPortfolioSummaryPdf;
  if (report.pdfKey && report.pdfFileName) {
    return {
      pdfBuffer: await downloadPdf(report.pdfKey),
      fileName: report.pdfFileName,
    };
  }
  const generatePdf = dependencies.generatePdf || generateMonthlyPortfolioSummaryPDF;
  const uploadPdf = dependencies.uploadPdf || uploadPortfolioSummaryPdf;
  const generated = await generatePdf(report);
  if (!generated.pdfBuffer?.length) throw new Error("Monthly portfolio PDF generation returned no content.");
  const uploaded = await uploadPdf({
    pdfBuffer: generated.pdfBuffer,
    fileName: generated.fileName,
    organizationId: report.organizationId,
    recipientUserId: report.recipientUserId,
    periodKey: report.periodKey,
  });
  report.pdfKey = uploaded.key;
  report.pdfUrl = uploaded.location;
  report.pdfFileName = generated.fileName;
  await report.save();
  return generated;
}

function monthlyPortfolioSummaryEmail(report, generated) {
  return {
    to: report.recipientSnapshot.email,
    subject: `Afterlight Monthly Portfolio Summary - ${report.periodLabel}`,
    text: [
      `${report.periodLabel} portfolio reporting is ready for ${report.organizationName}.`,
      "This report covers only the properties assigned to you when the monthly snapshot was created.",
      "Review the attached PDF and the underlying inspection reports before acting on a trend.",
    ].join("\n\n"),
    attachments: [{ filename: generated.fileName, content: generated.pdfBuffer }],
  };
}

async function deliverPortfolioEmail(report, generated, {
  sendEmail = sendSystemEmail,
  env = process.env,
} = {}) {
  if (report.mode !== "live" || monthlyPortfolioSummaryMode(env) !== "live" || report.emailSentAt) return;
  try {
    await sendEmail(monthlyPortfolioSummaryEmail(report, generated));
    report.emailSentAt = new Date();
    report.emailError = "";
    await report.save();
  } catch (error) {
    report.emailError = String(error?.message || "Monthly portfolio email delivery failed.").slice(0, 500);
    await report.save();
    throw error;
  }
}

async function deliverPortfolioNotification(report, {
  notify = sendUserNotification,
} = {}) {
  if (report.notificationSentAt) return;
  await notify({
    organizationId: report.organizationId,
    userId: report.recipientUserId,
    ...monthlyPortfolioSummaryReady(report),
  });
  report.notificationSentAt = new Date();
  await report.save();
}

async function processMonthlyPortfolioSummary(report, {
  env = process.env,
  OrganizationModel = Organization,
  ...dependencies
} = {}) {
  const organization = await OrganizationModel.findById(report.organizationId);
  if (!organization) {
    const error = new Error("The organization no longer exists.");
    error.permanent = true;
    throw error;
  }
  if (!isMonthlyPortfolioSummaryOrganizationAllowed(organization, env)) {
    const error = new Error("The organization is not enabled for monthly portfolio summaries.");
    error.permanent = true;
    throw error;
  }
  await ensurePortfolioMetrics(report, dependencies);
  await ensurePortfolioNarrative(report, { env, client: dependencies.bedrockClient });
  const generated = await ensurePortfolioPdf(report, dependencies);
  await deliverPortfolioEmail(report, generated, dependencies);
  await deliverPortfolioNotification(report, dependencies);

  report.status = "completed";
  report.completedAt = new Date();
  report.failedAt = null;
  report.lockedAt = null;
  report.lockedBy = "";
  report.lastError = "";
  await report.save();
  return report;
}

async function recordMonthlyPortfolioSummaryFailure(report, error) {
  const message = String(error?.message || "Monthly portfolio summary processing failed.").slice(0, 500);
  const exhausted = error?.permanent || report.attempts >= report.maxAttempts;
  report.status = exhausted ? "failed" : "queued";
  report.failedAt = exhausted ? new Date() : null;
  report.availableAt = exhausted
    ? report.availableAt
    : new Date(Date.now() + Math.min(15 * 60 * 1000, 60000 * (2 ** Math.max(0, report.attempts - 1))));
  report.lastError = message;
  report.lockedAt = null;
  report.lockedBy = "";
  await report.save();
  return report;
}

async function processNextMonthlyPortfolioSummary(options = {}) {
  if (monthlyPortfolioSummaryMode(options.env || process.env) === "off") return null;
  const report = await claimMonthlyPortfolioSummary(options);
  if (!report) return null;
  try {
    return await processMonthlyPortfolioSummary(report, options);
  } catch (error) {
    console.error(`Monthly portfolio summary ${report._id} failed on attempt ${report.attempts}:`, error.message);
    return recordMonthlyPortfolioSummaryFailure(report, error);
  }
}

function startMonthlyPortfolioSummaryWorker({
  pollMs = DEFAULT_POLL_MS,
  seedIntervalMs = SEED_INTERVAL_MS,
  env = process.env,
} = {}) {
  let stopped = false;
  let timer = null;
  let lastSeedAt = 0;
  async function poll() {
    if (stopped) return;
    try {
      if (Date.now() - lastSeedAt >= seedIntervalMs) {
        await seedMonthlyPortfolioSummaries({ env });
        lastSeedAt = Date.now();
      }
      const processed = await processNextMonthlyPortfolioSummary({ env });
      timer = setTimeout(poll, processed ? 0 : pollMs);
    } catch (error) {
      console.error("Monthly portfolio summary worker polling error:", error.message);
      timer = setTimeout(poll, pollMs);
    }
    timer.unref?.();
  }
  poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = {
  LEASE_MS,
  SEED_INTERVAL_MS,
  enqueueMonthlyPortfolioSummary,
  seedMonthlyPortfolioSummaries,
  claimMonthlyPortfolioSummary,
  periodRecords,
  ensurePortfolioMetrics,
  ensurePortfolioPdf,
  monthlyPortfolioSummaryEmail,
  deliverPortfolioEmail,
  deliverPortfolioNotification,
  processMonthlyPortfolioSummary,
  recordMonthlyPortfolioSummaryFailure,
  processNextMonthlyPortfolioSummary,
  startMonthlyPortfolioSummaryWorker,
};
