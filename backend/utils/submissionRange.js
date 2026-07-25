const DEFAULT_SUBMISSION_MONTHS = 12;
const MIN_SUBMISSION_MONTHS = 1;
const MAX_SUBMISSION_MONTHS = 18;

function parseSubmissionMonths(value) {
  if (value === undefined || value === "") return DEFAULT_SUBMISSION_MONTHS;
  if (!/^\d+$/.test(String(value))) return null;

  const months = Number(value);
  if (months < MIN_SUBMISSION_MONTHS || months > MAX_SUBMISSION_MONTHS) {
    return null;
  }

  return months;
}

function getSubmissionCutoff(months, now = new Date()) {
  const cutoff = new Date(now);
  const originalDay = cutoff.getDate();

  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - months);

  const lastDayOfTargetMonth = new Date(
    cutoff.getFullYear(),
    cutoff.getMonth() + 1,
    0
  ).getDate();
  cutoff.setDate(Math.min(originalDay, lastDayOfTargetMonth));

  return cutoff;
}

module.exports = {
  DEFAULT_SUBMISSION_MONTHS,
  MIN_SUBMISSION_MONTHS,
  MAX_SUBMISSION_MONTHS,
  parseSubmissionMonths,
  getSubmissionCutoff,
};
