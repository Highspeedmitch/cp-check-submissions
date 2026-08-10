const ESTIMATE_VERSION = 5;
const MINIMUM_PER_VISIT = 50;
const MANAGED_SERVICE_BASE_MONTHLY_CENTS = 50000;
const MAX_CLUSTER_PROPERTIES = 10;
const CLUSTER_DISTANCE_MILES = 0.5;
const ADDITIONAL_PROPERTY_MULTIPLIER = 0.5;

const SIZE_PRICE_ANCHORS = Object.freeze([
  Object.freeze({ squareFeet: 1500, perVisitDollars: 50 }),
  Object.freeze({ squareFeet: 18000, perVisitDollars: 125 }),
  Object.freeze({ squareFeet: 40000, perVisitDollars: 200 }),
  Object.freeze({ squareFeet: 78000, perVisitDollars: 250 }),
]);

const ROUTE_AWARE_POLICY = Object.freeze({
  includedRoundTripMiles: 10,
  includedRoundTripMinutes: 30,
  vehicleCostCentsPerMile: 70,
  travelLaborCentsPerHour: 3000,
  maximumTravelSurchargeRate: 0.35,
  routeSavingsPassThroughRate: 0.5,
  maximumRouteFitCreditRate: 0.7,
  modeledRouteCommitmentFactor: 0.9,
  routeFitZeroCreditMiles: 5,
  routeFitZeroCreditMinutes: 25,
  maximumPortfolioCreditRate: 0.15,
  maximumPortfolioCreditCents: 2500,
  maximumCombinedCreditRate: 0.8,
  manualReviewRoundTripMiles: 60,
  manualReviewRoundTripMinutes: 90,
  finalRoundingCents: 500,
});

const PROPERTY_COMPLEXITY = Object.freeze({
  free_standing: 0.87,
  strip_mall: 1,
  individual_suite: 0.74,
});

const SERVICE_VISITS = Object.freeze({
  monthly: 1,
  weekly: 4,
  ad_hoc: 1,
});

function roundTo25(amount) {
  return Math.round(amount / 25) * 25;
}

function roundCents(amountCents, incrementCents = 500) {
  return Math.round(amountCents / incrementCents) * incrementCents;
}

function benchmarkSizePrice(squareFeet) {
  const normalizedSize = Math.max(SIZE_PRICE_ANCHORS[0].squareFeet, Number(squareFeet));
  let upperAnchorIndex = SIZE_PRICE_ANCHORS.findIndex(
    (anchor) => normalizedSize <= anchor.squareFeet
  );
  if (upperAnchorIndex < 0) upperAnchorIndex = SIZE_PRICE_ANCHORS.length - 1;
  if (upperAnchorIndex === 0) return SIZE_PRICE_ANCHORS[0].perVisitDollars;

  const upperAnchor = SIZE_PRICE_ANCHORS[upperAnchorIndex];
  const lowerAnchor = SIZE_PRICE_ANCHORS[upperAnchorIndex - 1];
  const position = (normalizedSize - lowerAnchor.squareFeet)
    / (upperAnchor.squareFeet - lowerAnchor.squareFeet);
  return lowerAnchor.perVisitDollars
    + (position * (upperAnchor.perVisitDollars - lowerAnchor.perVisitDollars));
}

function managedServiceQuote(estimatedMonthlyCents, includeManagedServiceFee) {
  const includedInContractTotal = includeManagedServiceFee === true;
  return {
    baseMonthlyFeeCents: MANAGED_SERVICE_BASE_MONTHLY_CENTS,
    includedInContractTotal,
    estimatedContractMonthlyCents: estimatedMonthlyCents == null
      ? null
      : estimatedMonthlyCents
        + (includedInContractTotal ? MANAGED_SERVICE_BASE_MONTHLY_CENTS : 0),
  };
}

function calculateRouteFitScore({
  method,
  additionalMiles,
  additionalMinutes,
  policy = ROUTE_AWARE_POLICY,
}) {
  if (method !== "road_matrix") return 0;
  const milesRatio = Math.min(1, Math.max(0, additionalMiles) / policy.routeFitZeroCreditMiles);
  const minutesRatio = Math.min(
    1,
    Math.max(0, additionalMinutes) / policy.routeFitZeroCreditMinutes
  );
  return Math.min(1 - (milesRatio ** 2), 1 - (minutesRatio ** 2));
}

function routeCommitmentFactor(route, routeConfidence, policy = ROUTE_AWARE_POLICY) {
  if (route?.commitment === "none" || routeConfidence <= 0) return 0;
  if (route?.commitment === "confirmed" || routeConfidence >= 1) return 1;
  return policy.modeledRouteCommitmentFactor;
}

function routePricingBand(routeFitScore, commitmentFactor) {
  const effectiveFit = routeFitScore * commitmentFactor;
  if (effectiveFit >= 0.75) return "direct_route";
  if (effectiveFit >= 0.35) return "near_route";
  return "standard_route";
}

function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return number;
}

function estimateBidPricing({
  grossSquareFeet,
  propertyType,
  serviceFrequency,
  hasKnownIssues = false,
  includeManagedServiceFee = false,
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
  const sizeBase = benchmarkSizePrice(normalizedSize);
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

  const estimatedMonthlyCents = serviceFrequency === "ad_hoc"
    ? null
    : roundTo25(estimatedPerVisit * frequencyMultiplier) * 100;

  return {
    version: ESTIMATE_VERSION,
    pricingMode: "single",
    estimatedPerVisitCents: estimatedPerVisit * 100,
    estimatedMonthlyCents,
    managedService: managedServiceQuote(estimatedMonthlyCents, includeManagedServiceFee),
    requiresManualReview: manualReviewReasons.length > 0,
    manualReviewReasons,
    inputs: {
      normalizedSquareFeet: normalizedSize,
      complexityModifier,
      visitsPerMonth,
      frequencyMultiplier,
      knownIssuesProvided: Boolean(hasKnownIssues),
      minimumPerVisitCents: MINIMUM_PER_VISIT * 100,
      sizeBenchmarkPerVisitCents: Math.round(sizeBase * 100),
      benchmarkPropertyType: "strip_mall",
    },
  };
}

function estimateClusterPricing({
  properties,
  serviceFrequency,
  hasKnownIssues = false,
  withinHalfMile = false,
  sameScheduledVisit = false,
  includeManagedServiceFee = false,
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
    managedService: managedServiceQuote(estimatedMonthlyCents, includeManagedServiceFee),
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
      minimumPerVisitCents: MINIMUM_PER_VISIT * 100,
    },
    properties: propertyEstimates.map(({ manualReviewReasons: _reasons, ...property }) => property),
  };
}

function estimateRouteAwarePricing({
  grossSquareFeet,
  propertyType,
  serviceFrequency,
  hasKnownIssues = false,
  travelContext,
  policy = ROUTE_AWARE_POLICY,
  includeManagedServiceFee = false,
}) {
  if (!travelContext || typeof travelContext !== "object" || Array.isArray(travelContext)) {
    throw new Error("Route-aware pricing requires a travel context.");
  }
  const home = travelContext.home;
  const portfolio = travelContext.portfolio || {};
  const route = travelContext.route || {};
  if (!home || typeof home !== "object" || Array.isArray(home)) {
    throw new Error("Route-aware pricing requires home-base travel metrics.");
  }

  const baseEstimate = estimateBidPricing({
    grossSquareFeet,
    propertyType,
    serviceFrequency,
    hasKnownIssues,
  });
  const basePerVisitCents = baseEstimate.estimatedPerVisitCents;
  const roundTripMiles = nonNegativeNumber(home.roundTripMiles, "Home-base round-trip miles");
  const roundTripMinutes = nonNegativeNumber(home.roundTripMinutes, "Home-base round-trip minutes");
  const excessMiles = Math.max(0, roundTripMiles - policy.includedRoundTripMiles);
  const excessMinutes = Math.max(0, roundTripMinutes - policy.includedRoundTripMinutes);
  const rawTravelSurchargeCents = Math.round(
    (excessMiles * policy.vehicleCostCentsPerMile)
    + (excessMinutes * (policy.travelLaborCentsPerHour / 60))
  );
  const maximumTravelSurchargeCents = Math.round(
    basePerVisitCents * policy.maximumTravelSurchargeRate
  );
  const travelSurchargeCents = Math.min(
    rawTravelSurchargeCents,
    maximumTravelSurchargeCents
  );

  const standaloneTravelCostCents = Math.round(
    (roundTripMiles * policy.vehicleCostCentsPerMile)
    + (roundTripMinutes * (policy.travelLaborCentsPerHour / 60))
  );

  const routeConfidence = Math.min(1, Math.max(0, Number(route.confidence || 0)));
  const additionalRouteMiles = nonNegativeNumber(
    route.additionalMiles || 0,
    "Additional route miles"
  );
  const additionalRouteMinutes = nonNegativeNumber(
    route.additionalMinutes || 0,
    "Additional route minutes"
  );
  const incrementalRouteCostCents = Math.round(
    (additionalRouteMiles * policy.vehicleCostCentsPerMile)
    + (additionalRouteMinutes * (policy.travelLaborCentsPerHour / 60))
  );
  const calculatedRouteCreditCents = Math.round(
    Math.max(0, standaloneTravelCostCents - incrementalRouteCostCents)
      * routeConfidence
      * policy.routeSavingsPassThroughRate
  );

  const fitScore = calculateRouteFitScore({
    method: travelContext.method,
    additionalMiles: additionalRouteMiles,
    additionalMinutes: additionalRouteMinutes,
    policy,
  });
  const commitmentFactor = routeCommitmentFactor(route, routeConfidence, policy);
  const routeFitCreditCents = Math.round(
    basePerVisitCents
      * policy.maximumRouteFitCreditRate
      * fitScore
      * commitmentFactor
  );
  const uncappedRouteCreditCents = Math.max(
    calculatedRouteCreditCents,
    routeFitCreditCents
  );

  const densityScore = Math.min(1, Math.max(0, Number(portfolio.densityScore || 0)));
  const maximumPortfolioCreditCents = Math.min(
    policy.maximumPortfolioCreditCents,
    Math.round(basePerVisitCents * policy.maximumPortfolioCreditRate)
  );
  const portfolioCreditCents = Math.round(
    maximumPortfolioCreditCents * densityScore
  );
  const maximumCombinedCreditCents = Math.round(
    basePerVisitCents * policy.maximumCombinedCreditRate
  );
  const combinedCreditCents = Math.min(
    uncappedRouteCreditCents + portfolioCreditCents,
    maximumCombinedCreditCents,
    Math.max(0, basePerVisitCents + travelSurchargeCents - (MINIMUM_PER_VISIT * 100))
  );
  const routeCreditCents = Math.min(uncappedRouteCreditCents, combinedCreditCents);

  const estimatedPerVisitCents = roundCents(Math.max(
    MINIMUM_PER_VISIT * 100,
    basePerVisitCents + travelSurchargeCents - combinedCreditCents
  ), policy.finalRoundingCents);
  const estimatedMonthlyCents = serviceFrequency === "ad_hoc"
    ? null
    : roundCents(
      estimatedPerVisitCents * baseEstimate.inputs.frequencyMultiplier,
      policy.finalRoundingCents
    );
  const manualReviewReasons = [...baseEstimate.manualReviewReasons];
  if (travelContext.method !== "road_matrix") {
    manualReviewReasons.push(
      travelContext.providerFallback ? "routing_provider_fallback" : "modeled_route_data"
    );
  }
  if (roundTripMiles > policy.manualReviewRoundTripMiles
    || roundTripMinutes > policy.manualReviewRoundTripMinutes) {
    manualReviewReasons.push("travel_distance");
  }

  return {
    version: ESTIMATE_VERSION,
    pricingMode: "route_aware",
    estimatedPerVisitCents,
    estimatedMonthlyCents,
    managedService: managedServiceQuote(estimatedMonthlyCents, includeManagedServiceFee),
    basePerVisitCents,
    travelSurchargeCents,
    routeCreditCents,
    portfolioCreditCents: Math.max(
      0,
      combinedCreditCents - routeCreditCents
    ),
    combinedCreditCents,
    requiresManualReview: manualReviewReasons.length > 0,
    manualReviewReasons: [...new Set(manualReviewReasons)],
    inputs: {
      ...baseEstimate.inputs,
      minimumPerVisitCents: MINIMUM_PER_VISIT * 100,
      travelPolicy: { ...policy },
    },
    geography: {
      method: travelContext.method || "unknown",
      candidate: travelContext.candidate ? { ...travelContext.candidate } : null,
      home: { ...home },
      portfolio: { ...portfolio },
      route: {
        ...route,
        confidence: routeConfidence,
        fitScore: Number(fitScore.toFixed(4)),
        commitmentFactor,
        pricingBand: routePricingBand(fitScore, commitmentFactor),
        standaloneTravelCostCents,
        incrementalCostCents: incrementalRouteCostCents,
        travelSavingsCreditCents: calculatedRouteCreditCents,
        routeFitCreditCents,
      },
    },
  };
}

module.exports = {
  ESTIMATE_VERSION,
  MINIMUM_PER_VISIT,
  MANAGED_SERVICE_BASE_MONTHLY_CENTS,
  MAX_CLUSTER_PROPERTIES,
  CLUSTER_DISTANCE_MILES,
  ADDITIONAL_PROPERTY_MULTIPLIER,
  ROUTE_AWARE_POLICY,
  PROPERTY_COMPLEXITY,
  SIZE_PRICE_ANCHORS,
  SERVICE_VISITS,
  roundTo25,
  roundCents,
  benchmarkSizePrice,
  calculateRouteFitScore,
  routeCommitmentFactor,
  routePricingBand,
  estimateBidPricing,
  estimateClusterPricing,
  estimateRouteAwarePricing,
};
