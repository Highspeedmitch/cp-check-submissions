const {
  estimateBidPricing,
  roundCents,
} = require("./bidPricing");
const {
  BOUTIQUE_MAX_PROPERTIES,
  BOUTIQUE_MAX_PROPERTY_SQUARE_FEET_EXCLUSIVE,
  BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS,
  normalizePropertySquareFeet,
  normalizePropertyType,
} = require("./boutiquePolicy");
const {
  modeledLeg,
  normalizePoint,
} = require("./pricingGeography");

const METERS_PER_MILE = 1609.344;
const BOUTIQUE_ESTIMATE_VERSION = 1;
const BOUTIQUE_TRAVEL_POLICY = Object.freeze({
  includedRoundTripMiles: 10,
  includedRoundTripMinutes: 30,
  vehicleCostCentsPerMile: 76,
  travelLaborCentsPerHour: 3000,
  manualReviewRoundTripMiles: 60,
  manualReviewRoundTripMinutes: 90,
  finalRoundingCents: 500,
});

function boutiquePricingError(message, status = 400, code = "BOUTIQUE_PRICING_INVALID") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function roundMetric(value) {
  return Number(Number(value).toFixed(2));
}

function normalizeBoutiqueServiceFrequency(value) {
  const frequency = String(value || "monthly").trim().toLowerCase();
  if (frequency !== "monthly") {
    throw boutiquePricingError(
      "Boutique service is available only for monthly visits.",
      400,
      "BOUTIQUE_MONTHLY_SERVICE_REQUIRED"
    );
  }
  return frequency;
}

function allocateCentsByWeights(totalCents, weights) {
  const total = Number(totalCents);
  if (!Number.isInteger(total) || total < 0) {
    throw boutiquePricingError("Travel allocation must use non-negative whole cents.");
  }
  if (!Array.isArray(weights) || !weights.length) return [];
  const normalizedWeights = weights.map((weight) => {
    const number = Number(weight);
    return Number.isFinite(number) && number > 0 ? number : 0;
  });
  const suppliedWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  const allocationWeights = suppliedWeight > 0
    ? normalizedWeights
    : normalizedWeights.map(() => 1);
  const totalWeight = allocationWeights.reduce((sum, weight) => sum + weight, 0);
  const exact = allocationWeights.map((weight) => total * (weight / totalWeight));
  const allocations = exact.map(Math.floor);
  let remainder = total - allocations.reduce((sum, amount) => sum + amount, 0);
  const remainderOrder = exact
    .map((amount, index) => ({ index, fraction: amount - Math.floor(amount) }))
    .sort((first, second) => second.fraction - first.fraction || first.index - second.index);
  for (let index = 0; index < remainder; index += 1) {
    allocations[remainderOrder[index].index] += 1;
  }
  return allocations;
}

function normalizeBoutiqueProperties(properties) {
  if (!Array.isArray(properties) || properties.length < 1 || properties.length > BOUTIQUE_MAX_PROPERTIES) {
    throw boutiquePricingError(
      `Boutique pricing requires between 1 and ${BOUTIQUE_MAX_PROPERTIES} properties.`
    );
  }
  return properties.map((property, index) => ({
    index,
    grossSquareFeet: normalizePropertySquareFeet(
      property?.grossSquareFeet,
      "boutique",
      { required: true }
    ),
    propertyType: normalizePropertyType(property?.propertyType, "boutique", { required: true }),
    location: normalizePoint({
      id: property?.candidate?.id || property?.candidate?.locationId || `boutique-property-${index + 1}`,
      name: property?.candidate?.name || property?.candidate?.label || `Property ${index + 1}`,
      lat: property?.candidate?.lat,
      lng: property?.candidate?.lng,
    }, `Boutique property ${index + 1}`),
  }));
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map((remaining) => [value, ...remaining]));
}

function matrixLeg(matrix, fromIndex, toIndex) {
  const rawDistanceMeters = matrix?.distancesMeters?.[fromIndex]?.[toIndex];
  const rawDurationSeconds = matrix?.durationsSeconds?.[fromIndex]?.[toIndex];
  const distanceMeters = Number(rawDistanceMeters);
  const durationSeconds = Number(rawDurationSeconds);
  if (rawDistanceMeters === null || rawDistanceMeters === undefined
    || rawDurationSeconds === null || rawDurationSeconds === undefined
    || !Number.isFinite(distanceMeters) || distanceMeters < 0
    || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw boutiquePricingError(
      "Road routing could not connect every Boutique property.",
      422,
      "BOUTIQUE_ROUTING_INCOMPLETE"
    );
  }
  return {
    miles: distanceMeters / METERS_PER_MILE,
    minutes: durationSeconds / 60,
  };
}

function routeMetricsForOrder(order, legResolver) {
  const route = [0, ...order, 0];
  let miles = 0;
  let minutes = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const leg = legResolver(route[index], route[index + 1]);
    miles += leg.miles;
    minutes += leg.minutes;
  }
  return { order, miles, minutes };
}

function bestSharedRoute(propertyCount, legResolver) {
  return permutations(Array.from({ length: propertyCount }, (_, index) => index + 1))
    .map((order) => routeMetricsForOrder(order, legResolver))
    .sort((first, second) => first.minutes - second.minutes || first.miles - second.miles)[0];
}

function routeContextFromMatrix({ homeBase, properties, matrix, sameScheduledVisit }) {
  const legResolver = (fromIndex, toIndex) => matrixLeg(matrix, fromIndex, toIndex);
  const trips = sameScheduledVisit
    ? [bestSharedRoute(properties.length, legResolver)]
    : properties.map((_property, index) => routeMetricsForOrder([index + 1], legResolver));
  return {
    method: "road_matrix",
    provider: matrix.provider || "unknown",
    sameScheduledVisit,
    trips: trips.map((trip) => ({
      roundTripMiles: roundMetric(trip.miles),
      roundTripMinutes: roundMetric(trip.minutes),
      stopNames: trip.order.map((matrixIndex) => properties[matrixIndex - 1].location.name),
    })),
    homeBaseName: homeBase.name || "Operations base",
  };
}

function modeledRouteContext({ homeBase, properties, sameScheduledVisit, providerFallback = null }) {
  const points = [homeBase, ...properties.map((property) => property.location)];
  const legResolver = (fromIndex, toIndex) => modeledLeg(points[fromIndex], points[toIndex]);
  const trips = sameScheduledVisit
    ? [bestSharedRoute(properties.length, legResolver)]
    : properties.map((_property, index) => routeMetricsForOrder([index + 1], legResolver));
  return {
    method: "modeled_coordinates",
    sameScheduledVisit,
    providerFallback,
    trips: trips.map((trip) => ({
      roundTripMiles: roundMetric(trip.miles),
      roundTripMinutes: roundMetric(trip.minutes),
      stopNames: trip.order.map((pointIndex) => properties[pointIndex - 1].location.name),
    })),
    homeBaseName: homeBase.name || "Operations base",
  };
}

async function resolveBoutiqueTravelContext({
  properties,
  homeBase,
  routingClient,
  sameScheduledVisit = true,
}) {
  const normalizedProperties = normalizeBoutiqueProperties(properties);
  const normalizedHome = normalizePoint(homeBase, "Operations base");
  try {
    if (!routingClient?.getDrivingMatrix) throw new Error("Road routing client unavailable.");
    const matrix = await routingClient.getDrivingMatrix([
      normalizedHome,
      ...normalizedProperties.map((property) => property.location),
    ]);
    return {
      properties: normalizedProperties,
      travelContext: routeContextFromMatrix({
        homeBase: normalizedHome,
        properties: normalizedProperties,
        matrix,
        sameScheduledVisit: Boolean(sameScheduledVisit),
      }),
    };
  } catch (error) {
    return {
      properties: normalizedProperties,
      travelContext: modeledRouteContext({
        homeBase: normalizedHome,
        properties: normalizedProperties,
        sameScheduledVisit: Boolean(sameScheduledVisit),
        providerFallback: { code: String(error?.code || "PRICING_ROUTING_UNAVAILABLE") },
      }),
    };
  }
}

function tripTravelChargeCents(trip, policy = BOUTIQUE_TRAVEL_POLICY) {
  const excessMiles = Math.max(0, Number(trip.roundTripMiles) - policy.includedRoundTripMiles);
  const excessMinutes = Math.max(0, Number(trip.roundTripMinutes) - policy.includedRoundTripMinutes);
  return Math.round(
    (excessMiles * policy.vehicleCostCentsPerMile)
    + (excessMinutes * (policy.travelLaborCentsPerHour / 60))
  );
}

function estimateBoutiquePricing({
  properties,
  travelContext,
  hasKnownIssues = false,
  serviceFrequency = "monthly",
  policy = BOUTIQUE_TRAVEL_POLICY,
}) {
  const normalizedFrequency = normalizeBoutiqueServiceFrequency(serviceFrequency);
  const normalizedProperties = properties?.[0]?.location
    ? properties
    : normalizeBoutiqueProperties(properties);
  if (!travelContext || !Array.isArray(travelContext.trips) || !travelContext.trips.length) {
    throw boutiquePricingError("Boutique travel context is required.");
  }
  const propertyEstimates = normalizedProperties.map((property) => {
    const estimate = estimateBidPricing({
      grossSquareFeet: property.grossSquareFeet,
      propertyType: property.propertyType,
      serviceFrequency: normalizedFrequency,
      hasKnownIssues,
    });
    return {
      index: property.index,
      name: property.location.name,
      grossSquareFeet: property.grossSquareFeet,
      propertyType: property.propertyType,
      baseVisitCents: estimate.estimatedPerVisitCents,
    };
  });
  const baseVisitTotalCents = propertyEstimates.reduce(
    (total, property) => total + property.baseVisitCents,
    0
  );
  const rawTravelAdjustmentCents = travelContext.trips.reduce(
    (total, trip) => total + tripTravelChargeCents(trip, policy),
    0
  );
  const travelAdjustmentCents = roundCents(rawTravelAdjustmentCents, policy.finalRoundingCents);
  const estimatedMonthlyCents = baseVisitTotalCents + travelAdjustmentCents;
  const propertyTravelWeights = travelContext.sameScheduledVisit
    ? normalizedProperties.map(() => 1)
    : normalizedProperties.map((_property, index) => (
      tripTravelChargeCents(travelContext.trips[index] || {}, policy)
    ));
  const propertyTravelAdjustments = allocateCentsByWeights(
    travelAdjustmentCents,
    propertyTravelWeights
  );
  const propertyTotals = propertyEstimates.map((property, index) => ({
    ...property,
    travelAdjustmentCents: propertyTravelAdjustments[index],
    estimatedPerVisitCents: property.baseVisitCents + propertyTravelAdjustments[index],
    estimatedMonthlyCents: property.baseVisitCents + propertyTravelAdjustments[index],
  }));
  const manualReviewReasons = [];
  if (hasKnownIssues) manualReviewReasons.push("known_issues");
  if (travelContext.method !== "road_matrix") manualReviewReasons.push("routing_provider_fallback");
  if (travelContext.trips.some((trip) => (
    trip.roundTripMiles > policy.manualReviewRoundTripMiles
    || trip.roundTripMinutes > policy.manualReviewRoundTripMinutes
  ))) manualReviewReasons.push("travel_distance");

  return {
    version: `boutique-${BOUTIQUE_ESTIMATE_VERSION}`,
    pricingMode: "boutique",
    estimatedPerVisitCents: estimatedMonthlyCents,
    estimatedMonthlyCents,
    baseVisitTotalCents,
    travelAdjustmentCents,
    boutiqueService: {
      baseMonthlyFeeCents: BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS,
      estimatedContractMonthlyCents: BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS + estimatedMonthlyCents,
    },
    properties: propertyTotals,
    geography: {
      method: travelContext.method,
      provider: travelContext.provider || null,
      providerFallback: travelContext.providerFallback || null,
      sameScheduledVisit: Boolean(travelContext.sameScheduledVisit),
      trips: travelContext.trips,
    },
    requiresManualReview: manualReviewReasons.length > 0,
    manualReviewReasons,
    inputs: {
      propertyCount: propertyEstimates.length,
      maximumProperties: BOUTIQUE_MAX_PROPERTIES,
      maximumPropertySquareFeetExclusive: BOUTIQUE_MAX_PROPERTY_SQUARE_FEET_EXCLUSIVE,
      serviceFrequency: normalizedFrequency,
      travelPolicy: { ...policy },
    },
  };
}

module.exports = {
  BOUTIQUE_ESTIMATE_VERSION,
  BOUTIQUE_TRAVEL_POLICY,
  normalizeBoutiqueServiceFrequency,
  allocateCentsByWeights,
  normalizeBoutiqueProperties,
  permutations,
  routeContextFromMatrix,
  modeledRouteContext,
  resolveBoutiqueTravelContext,
  tripTravelChargeCents,
  estimateBoutiquePricing,
};
