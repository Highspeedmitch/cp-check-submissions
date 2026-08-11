export const BOUTIQUE_SERVICE_MODEL = "boutique";

export function portfolioReportingEnabled({ serviceModel, portfolioReportingIncluded } = {}) {
  return serviceModel !== BOUTIQUE_SERVICE_MODEL && portfolioReportingIncluded !== false;
}

export function afterlightCoverageExpected(serviceModel) {
  return [BOUTIQUE_SERVICE_MODEL, "managed", "hybrid"].includes(serviceModel);
}

export function inspectionSubmissionEnabled({ serviceModel, accountScope, assignmentId } = {}) {
  const hasAssignment = Boolean(String(assignmentId || "").trim());
  if (accountScope === "afterlight_resource") return hasAssignment;
  return serviceModel !== BOUTIQUE_SERVICE_MODEL || hasAssignment;
}
