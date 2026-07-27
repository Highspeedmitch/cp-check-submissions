const moment = require("moment-timezone");
const { DEFAULT_COM_FIELDS } = require("./inspectionTemplates");
const { managedProperties } = require("./propertyAccess");

const DEFAULT_REPORTING_TIMEZONE = "America/Phoenix";

function reportingTimezone(value) {
  return value && moment.tz.zone(value) ? value : DEFAULT_REPORTING_TIMEZONE;
}

function reportingProperties(organization, user) {
  return managedProperties(organization, user);
}

function issueFieldsForSubmission(submission) {
  const snapshotFields = submission.templateSnapshot?.fields;
  return Array.isArray(snapshotFields) && snapshotFields.length
    ? snapshotFields
    : DEFAULT_COM_FIELDS;
}

function submissionIssueOccurrences(submission) {
  const responses = submission.responses || {};
  return issueFieldsForSubmission(submission)
    .filter((field) => (
      field.type === "yes_no_issue"
      && String(responses[field.key] || "").trim().toLowerCase() === "yes"
    ))
    .map((field) => ({
      key: field.key,
      label: field.reportLabel || field.label || field.key,
    }));
}

function averageMinuteOfDay(dates, timezone) {
  if (!dates.length) return null;
  const zone = reportingTimezone(timezone);
  const totals = dates.reduce((result, date) => {
    const local = moment(date).tz(zone);
    const angle = ((local.hour() * 60 + local.minute()) / 1440) * Math.PI * 2;
    result.sin += Math.sin(angle);
    result.cos += Math.cos(angle);
    return result;
  }, { sin: 0, cos: 0 });
  let angle = Math.atan2(totals.sin / dates.length, totals.cos / dates.length);
  if (angle < 0) angle += Math.PI * 2;
  return Math.round((angle / (Math.PI * 2)) * 1440) % 1440;
}

function monthlyBuckets(submissions, months, timezone, now = new Date()) {
  const zone = reportingTimezone(timezone);
  const end = moment(now).tz(zone).startOf("month");
  const buckets = Array.from({ length: months }, (_, index) => {
    const month = end.clone().subtract(months - index - 1, "months");
    return {
      key: month.format("YYYY-MM"),
      label: month.format("MMM YYYY"),
      submissions: 0,
    };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  submissions.forEach((submission) => {
    const bucket = byKey.get(moment(submission.submittedAt).tz(zone).format("YYYY-MM"));
    if (bucket) bucket.submissions += 1;
  });
  return buckets.map(({ key, ...bucket }) => bucket);
}

function buildReportingSummary({
  submissions,
  users = [],
  properties = [],
  months = 12,
  timezone,
  selectedPropertyName = "",
  selectedUserId = "",
  now = new Date(),
}) {
  const userMap = new Map(users.map((user) => [
    String(user._id),
    user.username || user.email || "Unknown user",
  ]));
  const scopedSubmissions = submissions.filter((submission) => (
    (!selectedPropertyName || submission.property === selectedPropertyName)
    && (!selectedUserId || String(submission.userId) === String(selectedUserId))
  ));
  const issueCounts = new Map();
  let totalIssues = 0;
  scopedSubmissions.forEach((submission) => {
    submissionIssueOccurrences(submission).forEach((issue) => {
      totalIssues += 1;
      const current = issueCounts.get(issue.key) || {
        key: issue.key,
        label: issue.label,
        occurrences: 0,
      };
      current.occurrences += 1;
      issueCounts.set(issue.key, current);
    });
  });

  const submitterMap = new Map();
  scopedSubmissions.forEach((submission) => {
    const id = String(submission.userId);
    const current = submitterMap.get(id) || {
      userId: id,
      name: userMap.get(id) || "Unknown user",
      submissionCount: 0,
      submittedAt: [],
      properties: new Set(),
      mostRecentProperty: "",
      mostRecentAt: null,
    };
    current.submissionCount += 1;
    current.submittedAt.push(submission.submittedAt);
    current.properties.add(submission.property);
    if (!current.mostRecentAt || new Date(submission.submittedAt) > current.mostRecentAt) {
      current.mostRecentAt = new Date(submission.submittedAt);
      current.mostRecentProperty = submission.property;
    }
    submitterMap.set(id, current);
  });

  const submitters = [...submitterMap.values()]
    .map((submitter) => ({
      userId: submitter.userId,
      name: submitter.name,
      propertyCount: submitter.properties.size,
      properties: [...submitter.properties].sort(),
      submissionCount: submitter.submissionCount,
      averageSubmissionMinute: averageMinuteOfDay(submitter.submittedAt, timezone),
      mostRecentProperty: submitter.mostRecentProperty,
    }))
    .sort((a, b) => b.submissionCount - a.submissionCount || a.name.localeCompare(b.name));

  const visibleUserIds = new Set(submissions.map((submission) => String(submission.userId)));
  return {
    scope: {
      months,
      timezone: reportingTimezone(timezone),
      propertyName: selectedPropertyName || null,
      userId: selectedUserId || null,
    },
    summary: {
      submissionCount: scopedSubmissions.length,
      averageSubmissionMinute: averageMinuteOfDay(
        scopedSubmissions.map((submission) => submission.submittedAt),
        timezone
      ),
      issuesPerInspection: scopedSubmissions.length
        ? Number((totalIssues / scopedSubmissions.length).toFixed(1))
        : 0,
      distinctIssueTypes: issueCounts.size,
    },
    monthlyActivity: monthlyBuckets(scopedSubmissions, months, timezone, now),
    issues: [...issueCounts.values()]
      .sort((a, b) => b.occurrences - a.occurrences || a.label.localeCompare(b.label)),
    submitters,
    filterOptions: {
      properties: properties.map((property) => ({
        _id: String(property._id),
        name: property.name,
      })),
      users: users
        .filter((user) => visibleUserIds.has(String(user._id)))
        .map((user) => ({
          _id: String(user._id),
          name: user.username || user.email || "Unknown user",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
}

module.exports = {
  DEFAULT_REPORTING_TIMEZONE,
  reportingTimezone,
  reportingProperties,
  submissionIssueOccurrences,
  averageMinuteOfDay,
  monthlyBuckets,
  buildReportingSummary,
};
