export function inspectionIssueCoverageLabel(summary) {
  const reportableCount = Number(summary?.reportableIssueSubmissionCount || 0);
  const inspectionsWithIssues = Number(summary?.inspectionsWithIssuesCount || 0);
  return `${inspectionsWithIssues} of ${reportableCount} reportable ${reportableCount === 1 ? "inspection" : "inspections"}`;
}

export function formatInspectionIssuePercent(summary) {
  const percentage = Number(summary?.inspectionsWithIssuesPercent);
  const safePercentage = Number.isFinite(percentage) ? percentage : 0;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(safePercentage)}%`;
}
