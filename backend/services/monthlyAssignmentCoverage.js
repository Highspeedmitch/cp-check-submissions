const moment = require("moment-timezone");
const { reportingTimezone } = require("./reporting");

const MONTHLY_PROPERTY_STATUSES = Object.freeze({
  UNSCHEDULED: "unscheduled",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  MISSED: "missed",
});

function currentAssignmentMonth(timezone, now = new Date()) {
  const zone = reportingTimezone(timezone);
  const localNow = moment(now).tz(zone);
  const key = localNow.format("YYYY-MM");
  const logicalMonthStart = moment.utc(`${key}-01`, "YYYY-MM-DD", true);

  return {
    key,
    label: localNow.format("MMMM YYYY"),
    monthName: localNow.format("MMMM"),
    timezone: zone,
    start: logicalMonthStart.toDate(),
    end: logicalMonthStart.clone().add(1, "month").toDate(),
    todayStart: moment.utc(localNow.format("YYYY-MM-DD"), "YYYY-MM-DD", true).toDate(),
  };
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assignmentOverlapsPeriod(assignment, period) {
  const start = validDate(assignment?.startDate);
  const end = validDate(assignment?.endDate || assignment?.startDate);
  return Boolean(start && end && start < period.end && end >= period.start);
}

function buildMonthlyAssignmentCoverage({
  properties = [],
  assignments = [],
  period,
} = {}) {
  if (!period?.key || !period.start || !period.end || !period.todayStart) {
    throw new Error("A valid current-month assignment period is required.");
  }

  const propertyRows = properties.map((property) => ({
    propertyId: String(property?._id || property?.propertyId || ""),
    propertyName: String(property?.name || ""),
    status: MONTHLY_PROPERTY_STATUSES.UNSCHEDULED,
    assignmentCount: 0,
    scheduledAssignmentCount: 0,
    completedAssignmentCount: 0,
    missedAssignmentCount: 0,
  }));
  const rowByName = new Map(propertyRows.map((row) => [row.propertyName, row]));

  assignments.forEach((assignment) => {
    if (!["scheduled", "completed"].includes(assignment?.status)) return;
    if (!assignmentOverlapsPeriod(assignment, period)) return;
    const row = rowByName.get(String(assignment.propertyName || ""));
    if (!row) return;

    row.assignmentCount += 1;
    if (assignment.status === "completed") {
      row.completedAssignmentCount += 1;
      return;
    }

    const end = validDate(assignment.endDate || assignment.startDate);
    if (end < period.todayStart) row.missedAssignmentCount += 1;
    else row.scheduledAssignmentCount += 1;
  });

  propertyRows.forEach((row) => {
    if (row.missedAssignmentCount > 0) row.status = MONTHLY_PROPERTY_STATUSES.MISSED;
    else if (row.scheduledAssignmentCount > 0) row.status = MONTHLY_PROPERTY_STATUSES.SCHEDULED;
    else if (row.completedAssignmentCount > 0) row.status = MONTHLY_PROPERTY_STATUSES.COMPLETED;
  });

  const statusCounts = propertyRows.reduce((counts, row) => {
    counts[row.status] += 1;
    return counts;
  }, {
    [MONTHLY_PROPERTY_STATUSES.UNSCHEDULED]: 0,
    [MONTHLY_PROPERTY_STATUSES.SCHEDULED]: 0,
    [MONTHLY_PROPERTY_STATUSES.COMPLETED]: 0,
    [MONTHLY_PROPERTY_STATUSES.MISSED]: 0,
  });

  return {
    period: {
      key: period.key,
      label: period.label,
      monthName: period.monthName,
      timezone: period.timezone,
    },
    summary: {
      scheduledPropertyCount: propertyRows.length - statusCounts.unscheduled,
      totalPropertyCount: propertyRows.length,
      statusCounts,
    },
    properties: propertyRows,
  };
}

module.exports = {
  MONTHLY_PROPERTY_STATUSES,
  assignmentOverlapsPeriod,
  buildMonthlyAssignmentCoverage,
  currentAssignmentMonth,
};
