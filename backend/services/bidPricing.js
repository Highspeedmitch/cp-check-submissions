const ESTIMATE_VERSION = 1;

const PROPERTY_COMPLEXITY = Object.freeze({
  free_standing: 1,
  strip_mall: 1.15,
  individual_suite: 0.85,
});

const SERVICE_VISITS = Object.freeze({
  monthly: 1,
  weekly: 4,
  ad_hoc: 1,
});

function roundTo25(amount) {
  return Math.round(amount / 25) * 25;
}

function estimateBidPricing({
  grossSquareFeet,
  propertyType,
  serviceFrequency,
  hasKnownIssues = false,
}) {
  const squareFeet = Number(grossSquareFeet);
  if (!Number.isFinite(squareFeet) || squareFeet <= 0) {
    throw new Error("Gross square footage must be a positive number.");
  }
  if (!Object.hasOwn(PROPERTY_COMPLEXITY, propertyType)) {
    throw new Error("Unsupported property type.");
  }
  if (!Object.hasOwn(SERVICE_VISITS, serviceFrequency)) {
    throw new Error("Unsupported service frequency.");
  }

  const normalizedSize = Math.max(1500, squareFeet);
  const complexityModifier = PROPERTY_COMPLEXITY[propertyType];
  const visitsPerMonth = SERVICE_VISITS[serviceFrequency];
  const sizeBase = Math.max(150, 225 * Math.sqrt(normalizedSize / 18000));
  const estimatedPerVisit = roundTo25(Math.max(150, sizeBase * complexityModifier));
  const frequencyMultiplier = visitsPerMonth === 1
    ? 1
    : visitsPerMonth === 2
      ? 1.9
      : visitsPerMonth * 0.9;
  const manualReviewReasons = [];

  if (squareFeet > 250000) manualReviewReasons.push("property_size");
  if (complexityModifier > 1.5) manualReviewReasons.push("property_complexity");
  if (visitsPerMonth > 4) manualReviewReasons.push("service_frequency");
  if (serviceFrequency === "ad_hoc") manualReviewReasons.push("ad_hoc_frequency");
  if (hasKnownIssues) manualReviewReasons.push("known_issues");

  return {
    version: ESTIMATE_VERSION,
    estimatedPerVisitCents: estimatedPerVisit * 100,
    estimatedMonthlyCents: serviceFrequency === "ad_hoc"
      ? null
      : roundTo25(estimatedPerVisit * frequencyMultiplier) * 100,
    requiresManualReview: manualReviewReasons.length > 0,
    manualReviewReasons,
    inputs: {
      normalizedSquareFeet: normalizedSize,
      complexityModifier,
      visitsPerMonth,
      frequencyMultiplier,
      knownIssuesProvided: Boolean(hasKnownIssues),
    },
  };
}

module.exports = {
  ESTIMATE_VERSION,
  PROPERTY_COMPLEXITY,
  SERVICE_VISITS,
  roundTo25,
  estimateBidPricing,
};
