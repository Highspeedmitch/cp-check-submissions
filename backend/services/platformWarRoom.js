const moment = require("moment-timezone");
const Assignment = require("../models/assignment");
const Organization = require("../models/organization");
const User = require("../models/user");
const { resolveLicenseEntitlements } = require("./licenseEntitlements");
const {
  assignmentOverlapsPeriod,
  buildMonthlyAssignmentCoverage,
  currentAssignmentMonth,
} = require("./monthlyAssignmentCoverage");
const { reportingTimezone } = require("./reporting");

const DAY_MS = 24 * 60 * 60 * 1000;
const WAR_ROOM_SERVICE_MODELS = Object.freeze(["managed", "hybrid"]);
const WAR_ROOM_STATUSES = Object.freeze({
  COMPLETE: "complete",
  ON_TRACK: "on_track",
  AT_RISK: "at_risk",
  BEHIND: "behind",
});

function currentOperationalWeek(timezone, now = new Date()) {
  const zone = reportingTimezone(timezone);
  const localNow = moment(now).tz(zone);
  const startKey = localNow.clone().startOf("isoWeek").format("YYYY-MM-DD");
  const start = moment.utc(startKey, "YYYY-MM-DD", true);
  const end = start.clone().add(7, "days");
  const inclusiveEnd = end.clone().subtract(1, "day");
  return {
    key: startKey,
    label: `${start.format("MMM D")} - ${inclusiveEnd.format("MMM D")}`,
    timezone: zone,
    start: start.toDate(),
    end: end.toDate(),
  };
}

function assignmentPropertyKey(assignment, propertiesByName) {
  if (assignment?.propertyId) return String(assignment.propertyId);
  return propertiesByName.get(String(assignment?.propertyName || "")) || "";
}

function roundedPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function resolveWarRoomStatus({
  requiredPropertyCount,
  completedPropertyCount,
  unscheduledPropertyCount,
  missedPropertyCount,
  daysRemaining,
  hybridCoverage,
}) {
  const reasons = [];
  if (!requiredPropertyCount) {
    return {
      status: WAR_ROOM_STATUSES.AT_RISK,
      reasons: ["No active properties are configured."],
    };
  }

  if (missedPropertyCount > 0) {
    reasons.push(missedPropertyCount === 1
      ? "1 property missed its scheduled work."
      : `${countLabel(missedPropertyCount, "property", "properties")} missed their scheduled work.`);
  }
  if (unscheduledPropertyCount > 0) {
    reasons.push(`${countLabel(unscheduledPropertyCount, "property", "properties")} still needs monthly scheduling.`);
  }
  if (hybridCoverage && !hybridCoverage.meetsMinimum) {
    reasons.push(`Afterlight covers ${hybridCoverage.actualPercent}% of the portfolio; ${hybridCoverage.minimumPercent}% is required.`);
  }

  const monthlyRequirementsComplete = completedPropertyCount === requiredPropertyCount;
  const hybridRequirementComplete = !hybridCoverage || hybridCoverage.meetsMinimum;
  if (monthlyRequirementsComplete && hybridRequirementComplete && missedPropertyCount === 0) {
    return { status: WAR_ROOM_STATUSES.COMPLETE, reasons: [] };
  }
  if (missedPropertyCount > 0) {
    return { status: WAR_ROOM_STATUSES.BEHIND, reasons };
  }

  const unresolvedCoverage = unscheduledPropertyCount > 0 || !hybridRequirementComplete;
  if (unresolvedCoverage && daysRemaining <= 7) {
    return { status: WAR_ROOM_STATUSES.BEHIND, reasons };
  }
  if (unresolvedCoverage) {
    return { status: WAR_ROOM_STATUSES.AT_RISK, reasons };
  }
  return { status: WAR_ROOM_STATUSES.ON_TRACK, reasons: [] };
}

function buildOrganizationWarRoom({ organization, assignments = [], now = new Date() }) {
  const period = currentAssignmentMonth(organization.reportingTimezone, now);
  const week = currentOperationalWeek(organization.reportingTimezone, now);
  const properties = organization.properties || [];
  const monthlyAssignments = assignments.filter((assignment) =>
    ["scheduled", "completed"].includes(assignment.status)
    && assignmentOverlapsPeriod(assignment, period)
  );
  const coverage = buildMonthlyAssignmentCoverage({ properties, assignments: monthlyAssignments, period });
  const completedPropertyCount = coverage.properties.filter((property) =>
    property.completedAssignmentCount > 0
  ).length;
  const missedPropertyCount = coverage.summary.statusCounts.missed;
  const unscheduledPropertyCount = coverage.summary.statusCounts.unscheduled;
  const requiredPropertyCount = coverage.summary.totalPropertyCount;
  const coveredPropertyCount = coverage.summary.scheduledPropertyCount;
  const daysRemaining = Math.max(0, Math.ceil((period.end.getTime() - period.todayStart.getTime()) / DAY_MS));

  const propertiesByName = new Map(properties.map((property) => [String(property.name || ""), String(property._id)]));
  const activePropertyIds = new Set(properties.map((property) => String(property._id)));
  const afterlightPropertyIds = new Set(monthlyAssignments
    .filter((assignment) => assignment.fulfillment?.queue === "afterlight_coverage" || assignment.resourceProfileId)
    .map((assignment) => assignmentPropertyKey(assignment, propertiesByName))
    .filter((propertyId) => activePropertyIds.has(propertyId)));
  const entitlements = resolveLicenseEntitlements(organization);
  const minimumPercent = entitlements.afterlightPortfolioMinimumPercent;
  const requiredAssignedPropertyCount = Math.ceil(requiredPropertyCount * minimumPercent / 100);
  const hybridCoverage = organization.serviceModel === "hybrid" ? {
    assignedPropertyCount: afterlightPropertyIds.size,
    requiredAssignedPropertyCount,
    totalPropertyCount: requiredPropertyCount,
    actualPercent: roundedPercent(afterlightPropertyIds.size, requiredPropertyCount),
    minimumPercent,
    meetsMinimum: requiredPropertyCount > 0
      && afterlightPropertyIds.size >= requiredAssignedPropertyCount,
  } : null;

  const weeklyAssignments = monthlyAssignments.filter((assignment) => assignmentOverlapsPeriod(assignment, week));
  const weeklyCompletedCount = weeklyAssignments.filter((assignment) => assignment.status === "completed").length;
  const weeklyRemainingCount = weeklyAssignments.filter((assignment) => assignment.status === "scheduled").length;
  const weeklyOverdueCount = weeklyAssignments.filter((assignment) => {
    if (assignment.status !== "scheduled") return false;
    const end = new Date(assignment.endDate || assignment.startDate);
    return !Number.isNaN(end.getTime()) && end < period.todayStart;
  }).length;
  const status = resolveWarRoomStatus({
    requiredPropertyCount,
    completedPropertyCount,
    unscheduledPropertyCount,
    missedPropertyCount,
    daysRemaining,
    hybridCoverage,
  });

  return {
    organizationId: String(organization._id),
    name: organization.name,
    serviceModel: organization.serviceModel,
    planLabel: entitlements.label,
    reportingTimezone: period.timezone,
    status: status.status,
    statusReasons: status.reasons,
    month: {
      key: period.key,
      label: period.label,
      daysRemaining,
      requiredPropertyCount,
      coveredPropertyCount,
      completedPropertyCount,
      scheduledPropertyCount: coverage.summary.statusCounts.scheduled,
      unscheduledPropertyCount,
      missedPropertyCount,
    },
    week: {
      key: week.key,
      label: week.label,
      dueAssignmentCount: weeklyAssignments.length,
      completedAssignmentCount: weeklyCompletedCount,
      remainingAssignmentCount: weeklyRemainingCount,
      overdueAssignmentCount: weeklyOverdueCount,
    },
    hybridCoverage,
  };
}

async function leanSelection(query, selection) {
  let selected = query;
  if (typeof selected?.select === "function") selected = selected.select(selection);
  if (typeof selected?.lean === "function") selected = selected.lean();
  return selected;
}

function emptySummary() {
  return {
    organizationCount: 0,
    completeCount: 0,
    onTrackCount: 0,
    atRiskCount: 0,
    behindCount: 0,
    requiredPropertyCount: 0,
    coveredPropertyCount: 0,
    completedPropertyCount: 0,
    dueThisWeekCount: 0,
    remainingThisWeekCount: 0,
  };
}

async function getPlatformWarRoom({
  now = new Date(),
  OrganizationModel = Organization,
  UserModel = User,
  AssignmentModel = Assignment,
} = {}) {
  const organizations = await leanSelection(OrganizationModel.find({
    workspaceType: "customer",
    serviceModel: { $in: WAR_ROOM_SERVICE_MODELS },
  }), "_id name serviceModel license reportingTimezone properties._id properties.name");
  const organizationIds = organizations.map((organization) => organization._id);
  if (!organizationIds.length) {
    const month = currentAssignmentMonth("America/Phoenix", now);
    const week = currentOperationalWeek("America/Phoenix", now);
    return {
      generatedAt: now,
      period: { monthKey: month.key, monthLabel: month.label, weekKey: week.key, weekLabel: week.label },
      summary: emptySummary(),
      organizations: [],
    };
  }

  const activeMemberships = await UserModel.aggregate([{
    $match: {
      organizationId: { $in: organizationIds },
      accountScope: { $ne: "afterlight_resource" },
      accountStatus: { $ne: "inactive" },
      organizationArchivedAt: null,
    },
  }, { $group: { _id: "$organizationId" } }]);
  const activeOrganizationIds = new Set(activeMemberships.map((membership) => String(membership._id)));
  const activeOrganizations = organizations.filter((organization) =>
    activeOrganizationIds.has(String(organization._id))
  );
  const activeIds = activeOrganizations.map((organization) => organization._id);

  let assignments = [];
  if (activeIds.length) {
    const periods = activeOrganizations.map((organization) => currentAssignmentMonth(organization.reportingTimezone, now));
    const earliestStart = new Date(Math.min(...periods.map((period) => period.start.getTime())));
    const latestEnd = new Date(Math.max(...periods.map((period) => period.end.getTime())));
    assignments = await leanSelection(AssignmentModel.find({
      organizationId: { $in: activeIds },
      status: { $in: ["scheduled", "completed"] },
      startDate: { $lt: latestEnd },
      endDate: { $gte: earliestStart },
    }), "organizationId propertyId propertyName startDate endDate status completedAt fulfillment.queue resourceProfileId");
  }

  const assignmentsByOrganization = new Map();
  assignments.forEach((assignment) => {
    const key = String(assignment.organizationId);
    if (!assignmentsByOrganization.has(key)) assignmentsByOrganization.set(key, []);
    assignmentsByOrganization.get(key).push(assignment);
  });
  const statusOrder = {
    [WAR_ROOM_STATUSES.BEHIND]: 0,
    [WAR_ROOM_STATUSES.AT_RISK]: 1,
    [WAR_ROOM_STATUSES.ON_TRACK]: 2,
    [WAR_ROOM_STATUSES.COMPLETE]: 3,
  };
  const rows = activeOrganizations.map((organization) => buildOrganizationWarRoom({
    organization,
    assignments: assignmentsByOrganization.get(String(organization._id)) || [],
    now,
  })).sort((first, second) => statusOrder[first.status] - statusOrder[second.status]
    || first.name.localeCompare(second.name));
  const summary = rows.reduce((result, row) => {
    result.organizationCount += 1;
    if (row.status === WAR_ROOM_STATUSES.COMPLETE) result.completeCount += 1;
    if (row.status === WAR_ROOM_STATUSES.ON_TRACK) result.onTrackCount += 1;
    if (row.status === WAR_ROOM_STATUSES.AT_RISK) result.atRiskCount += 1;
    if (row.status === WAR_ROOM_STATUSES.BEHIND) result.behindCount += 1;
    result.requiredPropertyCount += row.month.requiredPropertyCount;
    result.coveredPropertyCount += row.month.coveredPropertyCount;
    result.completedPropertyCount += row.month.completedPropertyCount;
    result.dueThisWeekCount += row.week.dueAssignmentCount;
    result.remainingThisWeekCount += row.week.remainingAssignmentCount;
    return result;
  }, emptySummary());
  const month = currentAssignmentMonth("America/Phoenix", now);
  const week = currentOperationalWeek("America/Phoenix", now);

  return {
    generatedAt: now,
    period: {
      monthKey: month.key,
      monthLabel: month.label,
      weekKey: week.key,
      weekLabel: week.label,
    },
    summary,
    organizations: rows,
  };
}

module.exports = {
  WAR_ROOM_SERVICE_MODELS,
  WAR_ROOM_STATUSES,
  buildOrganizationWarRoom,
  currentOperationalWeek,
  getPlatformWarRoom,
  resolveWarRoomStatus,
};
