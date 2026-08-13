export const ASSIGNMENT_VIEWS = {
  ATTENTION: "attention",
  UPCOMING: "upcoming",
  ALL: "all",
};

function dateKeyFromValue(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (dateOnly) return dateOnly;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function dateKeyParts(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return { year, month, day };
}

function dateKeyTime(dateKey) {
  const { year, month, day } = dateKeyParts(dateKey);
  return Date.UTC(year, month - 1, day);
}

export function todayDateKey(now = new Date(), timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    ...(timeZone ? { timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function assignmentDueDateKey(assignment) {
  return dateKeyFromValue(assignment?.endDate || assignment?.serviceDate || assignment?.startDate);
}

export function assignmentStartDateKey(assignment) {
  return dateKeyFromValue(assignment?.serviceDate || assignment?.startDate || assignment?.endDate);
}

export function assignmentUrgency(assignment, options = {}) {
  const dueDateKey = assignmentDueDateKey(assignment);
  const today = todayDateKey(options.now, options.timeZone);
  if (!dueDateKey) return "unscheduled";
  if (dueDateKey < today) return "overdue";
  if (dueDateKey === today) return "today";
  return "upcoming";
}

export function assignmentTimingLabel(assignment, options = {}) {
  const dueDateKey = assignmentDueDateKey(assignment);
  const today = todayDateKey(options.now, options.timeZone);
  if (!dueDateKey) return "Due date unavailable";
  const difference = Math.round((dateKeyTime(dueDateKey) - dateKeyTime(today)) / 86_400_000);
  if (difference < 0) {
    const days = Math.abs(difference);
    return `Overdue by ${days} day${days === 1 ? "" : "s"}`;
  }
  if (difference === 0) return "Due today";
  if (difference === 1) return "Due tomorrow";
  return `Due ${formatAssignmentDate(dueDateKey)}`;
}

export function formatAssignmentDate(value) {
  const dateKey = dateKeyFromValue(value);
  if (!dateKey) return "Date unavailable";
  const { year, month, day } = dateKeyParts(dateKey);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function assignmentDateRangeLabel(assignment) {
  const startDateKey = assignmentStartDateKey(assignment);
  const dueDateKey = assignmentDueDateKey(assignment);
  if (!startDateKey && !dueDateKey) return "Date unavailable";
  if (!startDateKey || startDateKey === dueDateKey) {
    return formatAssignmentDate(dueDateKey || startDateKey);
  }
  return `${formatAssignmentDate(startDateKey)} to ${formatAssignmentDate(dueDateKey)}`;
}

function compareAssignments(first, second) {
  const firstDue = assignmentDueDateKey(first) || "9999-12-31";
  const secondDue = assignmentDueDateKey(second) || "9999-12-31";
  if (firstDue !== secondDue) return firstDue.localeCompare(secondDue);
  const firstStart = assignmentStartDateKey(first) || "9999-12-31";
  const secondStart = assignmentStartDateKey(second) || "9999-12-31";
  if (firstStart !== secondStart) return firstStart.localeCompare(secondStart);
  return String(first?.propertyName || "").localeCompare(String(second?.propertyName || ""));
}

export function buildAssignmentQueue(assignments = [], options = {}) {
  const all = [...assignments].sort(compareAssignments);
  const attention = all.filter((assignment) => {
    const urgency = assignmentUrgency(assignment, options);
    return urgency === "overdue" || urgency === "today";
  });
  const upcoming = all.filter((assignment) => assignmentUrgency(assignment, options) === "upcoming");
  return {
    [ASSIGNMENT_VIEWS.ATTENTION]: attention,
    [ASSIGNMENT_VIEWS.UPCOMING]: upcoming,
    [ASSIGNMENT_VIEWS.ALL]: all,
  };
}
