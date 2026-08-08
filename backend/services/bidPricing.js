const ESTIMATE_VERSION = 2;
const MINIMUM_PER_VISIT = 75;
const MAX_CLUSTER_PROPERTIES = 10;
const CLUSTER_DISTANCE_MILES = 0.5;
const ADDITIONAL_PROPERTY_MULTIPLIER = 0.5;

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
  const sizeBase = Math.max(MINIMUM_PER_VISIT, 225 * Math.sqrt(normalizedSize / 18000));
  const estimatedPerVisit = roundTo25(Math.max(
    MINIMUM_PER_VISIT,
    sizeBase * complexityModifier
  ));
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

function estimateClusterPricing({
  properties,
  serviceFrequency,
  hasKnownIssues = false,
  withinHalfMile = false,
  sameScheduledVisit = false,
}) {
  if (!Array.isArray(properties) || properties.length < 2) {
    throw new Error("A cluster must include at least two properties.");
  }
  if (properties.length > MAX_CLUSTER_PROPERTIES) {
    throw new Error(`A cluster cannot include more than ${MAX_CLUSTER_PROPERTIES} properties.`);
  }
  properties.forEach((property, index) => {
    if (!property || typeof property !== "object" || Array.isArray(property)) {
      throw new Error(`Cluster property ${index + 1} is invalid.`);
    }
  });
  if (withinHalfMile !== true) {
    throw new Error(`Confirm that every property is within ${CLUSTER_DISTANCE_MILES} mile of the primary property.`);
  }
  if (sameScheduledVisit !== true) {
    throw new Error("Confirm that every property will be serviced during the same scheduled visit.");
  }

  const propertyEstimates = properties.map((property, index) => {
    const estimate = estimateBidPricing({
      grossSquareFeet: property.grossSquareFeet,
      propertyType: property.propertyType,
      serviceFrequency,
      hasKnownIssues,
    });
    return {
      index,
      grossSquareFeet: Number(property.grossSquareFeet),
      propertyType: property.propertyType,
      standalonePerVisitCents: estimate.estimatedPerVisitCents,
      standaloneMonthlyCents: estimate.estimatedMonthlyCents,
      normalizedSquareFeet: estimate.inputs.normalizedSquareFeet,
      complexityModifier: estimate.inputs.complexityModifier,
      manualReviewReasons: estimate.manualReviewReasons,
    };
  });
  const primaryPropertyIndex = propertyEstimates.reduce((primaryIndex, property, index, list) => (
    property.standalonePerVisitCents > list[primaryIndex].standalonePerVisitCents
      ? index
      : primaryIndex
  ), 0);
  const standalonePerVisitCents = propertyEstimates.reduce(
    (total, property) => total + property.standalonePerVisitCents,
    0
  );
  const primaryPerVisit = propertyEstimates[primaryPropertyIndex].standalonePerVisitCents / 100;
  const additionalPerVisit = propertyEstimates.reduce((total, property, index) => (
    index === primaryPropertyIndex
      ? total
      : total + (property.standalonePerVisitCents / 100)
  ), 0);
  const estimatedPerVisit = roundTo25(
    primaryPerVisit + (additionalPerVisit * ADDITIONAL_PROPERTY_MULTIPLIER)
  );
  const visitsPerMonth = SERVICE_VISITS[serviceFrequency];
  const frequencyMultiplier = visitsPerMonth === 1
    ? 1
    : visitsPerMonth === 2
      ? 1.9
      : visitsPerMonth * 0.9;
  const estimatedMonthlyCents = serviceFrequency === "ad_hoc"
    ? null
    : roundTo25(estimatedPerVisit * frequencyMultiplier) * 100;
  const standaloneMonthlyCents = serviceFrequency === "ad_hoc"
    ? null
    : propertyEstimates.reduce(
      (total, property) => total + property.standaloneMonthlyCents,
      0
    );
  const manualReviewReasons = [...new Set(
    propertyEstimates.flatMap((property) => property.manualReviewReasons)
  )];
  const estimatedPerVisitCents = estimatedPerVisit * 100;

  return {
    version: ESTIMATE_VERSION,
    pricingMode: "cluster",
    estimatedPerVisitCents,
    estimatedMonthlyCents,
    standalonePerVisitCents,
    standaloneMonthlyCents,
    clusterDiscountPerVisitCents: standalonePerVisitCents - estimatedPerVisitCents,
    clusterDiscountMonthlyCents: standaloneMonthlyCents == null
      ? null
      : standaloneMonthlyCents - estimatedMonthlyCents,
    requiresManualReview: manualReviewReasons.length > 0,
    manualReviewReasons,
    inputs: {
      propertyCount: propertyEstimates.length,
      primaryPropertyIndex,
      additionalPropertyMultiplier: ADDITIONAL_PROPERTY_MULTIPLIER,
      clusterDistanceMiles: CLUSTER_DISTANCE_MILES,
      visitsPerMonth,
      frequencyMultiplier,
      knownIssuesProvided: Boolean(hasKnownIssues),
    },
    properties: propertyEstimates.map(({ manualReviewReasons: _reasons, ...property }) => property),
  };
}

module.exports = {
  ESTIMATE_VERSION,
  MINIMUM_PER_VISIT,
  MAX_CLUSTER_PROPERTIES,
  CLUSTER_DISTANCE_MILES,
  ADDITIONAL_PROPERTY_MULTIPLIER,
  PROPERTY_COMPLEXITY,
  SERVICE_VISITS,
  roundTo25,
  estimateBidPricing,
  estimateClusterPricing,
};
