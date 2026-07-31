export function issueCoverageLabel(summary, issues = []) {
  const reportableCount = Number(summary?.reportableIssueSubmissionCount || 0);
  const reportedTotal = Number(summary?.totalIssueOccurrences);
  const issueCount = Number.isFinite(reportedTotal)
    ? reportedTotal
    : issues.reduce((total, issue) => total + Number(issue.occurrences || 0), 0);
  return `${issueCount} ${issueCount === 1 ? "issue" : "issues"} across ${reportableCount} ${reportableCount === 1 ? "inspection" : "inspections"}`;
}
