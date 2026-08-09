const EARTH_RADIUS_MILES = 3958.7613;
const METERS_PER_MILE = 1609.344;

const DEFAULT_GEOGRAPHY_POLICY = Object.freeze({
  roadDistanceFactor: 1.2,
  modeledAverageMilesPerHour: 25,
  portfolioDecayMiles: 3,
  portfolioScale: 2,
  maximumPortfolioProperties: 10,
  modeledRouteConfidence: 0.6,
});

const ROUTE_COMMITMENTS = new Set(["none", "modeled", "confirmed"]);

function coordinate(value, minimum, maximum, label) {
  if (value === "" || value === null || value === undefined) {
    throw new Error(`${label} must be a valid coordinate.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be a valid coordinate.`);
  }
  return number;
}

function normalizePoint(point, label = "Location") {
  if (!point || typeof point !== "object" || Array.isArray(point)) {
    throw new Error(`${label} coordinates are required.`);
  }
  return {
    id: point.id == null ? "" : String(point.id),
    name: point.name == null ? "" : String(point.name),
    lat: coordinate(point.lat, -90, 90, `${label} latitude`),
    lng: coordinate(point.lng, -180, 180, `${label} longitude`),
  };
}

function radians(degrees) {
  return degrees * (Math.PI / 180);
}

function haversineMiles(firstPoint, secondPoint) {
  const first = normalizePoint(firstPoint, "First location");
  const second = normalizePoint(secondPoint, "Second location");
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lng - first.lng);
  const firstLatitude = radians(first.lat);
  const secondLatitude = radians(second.lat);
  const value = (Math.sin(latitudeDelta / 2) ** 2)
    + (Math.cos(firstLatitude) * Math.cos(secondLatitude)
      * (Math.sin(longitudeDelta / 2) ** 2));
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(value));
}

function modeledLeg(first, second, policy = DEFAULT_GEOGRAPHY_POLICY) {
  const airMiles = haversineMiles(first, second);
  const miles = airMiles * policy.roadDistanceFactor;
  return {
    airMiles,
    miles,
    minutes: (miles / policy.modeledAverageMilesPerHour) * 60,
  };
}

function nearestNeighborRoute(homeBase, properties, policy = DEFAULT_GEOGRAPHY_POLICY) {
  const remaining = [...properties];
  const route = [homeBase];
  let current = homeBase;
  while (remaining.length) {
    let nearestIndex = 0;
    let nearestDistance = modeledLeg(current, remaining[0], policy).miles;
    for (let index = 1; index < remaining.length; index += 1) {
      const distance = modeledLeg(current, remaining[index], policy).miles;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    current = remaining.splice(nearestIndex, 1)[0];
    route.push(current);
  }
  route.push(homeBase);
  return route;
}

function bestRouteInsertion(route, candidate, policy = DEFAULT_GEOGRAPHY_POLICY) {
  let best = null;
  for (let index = 0; index < route.length - 1; index += 1) {
    const before = route[index];
    const after = route[index + 1];
    const existingLeg = modeledLeg(before, after, policy);
    const outbound = modeledLeg(before, candidate, policy);
    const inbound = modeledLeg(candidate, after, policy);
    const additionalMiles = Math.max(0, outbound.miles + inbound.miles - existingLeg.miles);
    const additionalMinutes = Math.max(
      0,
      outbound.minutes + inbound.minutes - existingLeg.minutes
    );
    if (!best || additionalMinutes < best.additionalMinutes
      || (additionalMinutes === best.additionalMinutes && additionalMiles < best.additionalMiles)) {
      best = {
        insertionIndex: index + 1,
        afterPropertyId: before.id || null,
        afterPropertyName: before.name || "Operations base",
        beforePropertyId: after.id || null,
        beforePropertyName: after.name || "Operations base",
        additionalMiles,
        additionalMinutes,
      };
    }
  }
  return best;
}

function portfolioDensity(candidate, properties, policy = DEFAULT_GEOGRAPHY_POLICY) {
  const distances = properties.map((property) => ({
    propertyId: property.id || null,
    propertyName: property.name || "Portfolio property",
    distanceMiles: haversineMiles(candidate, property),
  })).sort((first, second) => first.distanceMiles - second.distanceMiles);
  return portfolioDensityFromDistances(distances, policy);
}

function portfolioDensityFromDistances(distances, policy = DEFAULT_GEOGRAPHY_POLICY) {
  const sortedDistances = [...distances]
    .sort((first, second) => first.distanceMiles - second.distanceMiles);
  const influence = sortedDistances.reduce(
    (total, item) => total + Math.exp(-item.distanceMiles / policy.portfolioDecayMiles),
    0
  );
  return {
    densityScore: sortedDistances.length
      ? 1 - Math.exp(-influence / policy.portfolioScale)
      : 0,
    nearestPropertyDistanceMiles: sortedDistances[0]?.distanceMiles ?? null,
    nearbyProperties: sortedDistances.slice(0, 3),
  };
}

function roundMetric(value) {
  return Number(Number(value).toFixed(2));
}

function preparePricingLocations({
  homeBase,
  candidate,
  portfolioProperties = [],
  policy = DEFAULT_GEOGRAPHY_POLICY,
}) {
  const normalizedHome = normalizePoint(homeBase, "Operations base");
  const normalizedCandidate = normalizePoint(candidate, "Proposed property");
  const normalizedProperties = portfolioProperties
    .map((property) => {
      try {
        return normalizePoint(property, "Portfolio property");
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((first, second) => haversineMiles(normalizedCandidate, first)
      - haversineMiles(normalizedCandidate, second))
    .slice(0, policy.maximumPortfolioProperties);
  return {
    homeBase: normalizedHome,
    candidate: normalizedCandidate,
    portfolioProperties: normalizedProperties,
  };
}

function pricingMatrixPoints(options) {
  const locations = preparePricingLocations(options);
  return [locations.homeBase, locations.candidate, ...locations.portfolioProperties];
}

function buildModeledTravelContext({
  homeBase,
  candidate,
  portfolioProperties = [],
  routeCommitment = "modeled",
  policy = DEFAULT_GEOGRAPHY_POLICY,
}) {
  const locations = preparePricingLocations({
    homeBase,
    candidate,
    portfolioProperties,
    policy,
  });
  const normalizedHome = locations.homeBase;
  const normalizedCandidate = locations.candidate;
  if (!ROUTE_COMMITMENTS.has(routeCommitment)) {
    throw new Error("Select a valid route commitment.");
  }
  const normalizedProperties = locations.portfolioProperties;
  const homeLeg = modeledLeg(normalizedHome, normalizedCandidate, policy);
  const density = portfolioDensity(normalizedCandidate, normalizedProperties, policy);
  const route = nearestNeighborRoute(normalizedHome, normalizedProperties, policy);
  const insertion = bestRouteInsertion(route, normalizedCandidate, policy);
  const confidence = !normalizedProperties.length || routeCommitment === "none"
    ? 0
    : routeCommitment === "confirmed" ? 1 : policy.modeledRouteConfidence;

  return {
    method: "modeled_coordinates",
    candidate: {
      id: normalizedCandidate.id || null,
      name: normalizedCandidate.name || "Proposed property",
      lat: normalizedCandidate.lat,
      lng: normalizedCandidate.lng,
    },
    home: {
      oneWayAirMiles: roundMetric(homeLeg.airMiles),
      oneWayRoadMiles: roundMetric(homeLeg.miles),
      oneWayMinutes: roundMetric(homeLeg.minutes),
      roundTripMiles: roundMetric(homeLeg.miles * 2),
      roundTripMinutes: roundMetric(homeLeg.minutes * 2),
    },
    portfolio: {
      propertyCount: normalizedProperties.length,
      densityScore: Number(density.densityScore.toFixed(4)),
      nearestPropertyDistanceMiles: density.nearestPropertyDistanceMiles == null
        ? null
        : roundMetric(density.nearestPropertyDistanceMiles),
      nearbyProperties: density.nearbyProperties.map((property) => ({
        ...property,
        distanceMiles: roundMetric(property.distanceMiles),
      })),
    },
    route: {
      commitment: routeCommitment,
      confidence,
      modeledStopCount: normalizedProperties.length,
      insertionIndex: insertion?.insertionIndex ?? null,
      insertionAfterPropertyId: insertion?.afterPropertyId ?? null,
      insertionAfterPropertyName: insertion?.afterPropertyName ?? null,
      insertionBeforePropertyId: insertion?.beforePropertyId ?? null,
      insertionBeforePropertyName: insertion?.beforePropertyName ?? null,
      additionalMiles: roundMetric(insertion?.additionalMiles ?? homeLeg.miles * 2),
      additionalMinutes: roundMetric(insertion?.additionalMinutes ?? homeLeg.minutes * 2),
    },
  };
}

function roadMatrixLeg(matrix, fromIndex, toIndex) {
  const distanceMeters = matrix?.distancesMeters?.[fromIndex]?.[toIndex];
  const durationSeconds = matrix?.durationsSeconds?.[fromIndex]?.[toIndex];
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0
    || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new Error("Road routing could not connect every pricing location.");
  }
  return {
    miles: distanceMeters / METERS_PER_MILE,
    minutes: durationSeconds / 60,
  };
}

function roadMatrixRoute(homeBase, properties, matrix) {
  const remaining = properties.map((property, index) => ({
    point: property,
    matrixIndex: index + 2,
  }));
  const route = [{ point: homeBase, matrixIndex: 0 }];
  let currentIndex = 0;
  while (remaining.length) {
    let nearestIndex = 0;
    let nearestLeg = roadMatrixLeg(matrix, currentIndex, remaining[0].matrixIndex);
    for (let index = 1; index < remaining.length; index += 1) {
      const candidateLeg = roadMatrixLeg(matrix, currentIndex, remaining[index].matrixIndex);
      if (candidateLeg.minutes < nearestLeg.minutes
        || (candidateLeg.minutes === nearestLeg.minutes
          && candidateLeg.miles < nearestLeg.miles)) {
        nearestLeg = candidateLeg;
        nearestIndex = index;
      }
    }
    const next = remaining.splice(nearestIndex, 1)[0];
    route.push(next);
    currentIndex = next.matrixIndex;
  }
  route.push({ point: homeBase, matrixIndex: 0 });
  return route;
}

function bestRoadMatrixInsertion(route, matrix) {
  let best = null;
  for (let index = 0; index < route.length - 1; index += 1) {
    const before = route[index];
    const after = route[index + 1];
    const existingLeg = roadMatrixLeg(matrix, before.matrixIndex, after.matrixIndex);
    const outbound = roadMatrixLeg(matrix, before.matrixIndex, 1);
    const inbound = roadMatrixLeg(matrix, 1, after.matrixIndex);
    const additionalMiles = Math.max(0, outbound.miles + inbound.miles - existingLeg.miles);
    const additionalMinutes = Math.max(
      0,
      outbound.minutes + inbound.minutes - existingLeg.minutes
    );
    if (!best || additionalMinutes < best.additionalMinutes
      || (additionalMinutes === best.additionalMinutes && additionalMiles < best.additionalMiles)) {
      best = {
        insertionIndex: index + 1,
        afterPropertyId: before.point.id || null,
        afterPropertyName: before.point.name || "Operations base",
        beforePropertyId: after.point.id || null,
        beforePropertyName: after.point.name || "Operations base",
        additionalMiles,
        additionalMinutes,
      };
    }
  }
  return best;
}

function buildRoadMatrixTravelContext({
  homeBase,
  candidate,
  portfolioProperties = [],
  routeCommitment = "modeled",
  matrix,
  policy = DEFAULT_GEOGRAPHY_POLICY,
}) {
  if (!ROUTE_COMMITMENTS.has(routeCommitment)) {
    throw new Error("Select a valid route commitment.");
  }
  const locations = preparePricingLocations({
    homeBase,
    candidate,
    portfolioProperties,
    policy,
  });
  const points = [locations.homeBase, locations.candidate, ...locations.portfolioProperties];
  if (matrix?.distancesMeters?.length !== points.length
    || matrix?.durationsSeconds?.length !== points.length) {
    throw new Error("Road routing returned an incomplete pricing matrix.");
  }

  const outboundHomeLeg = roadMatrixLeg(matrix, 0, 1);
  const returnHomeLeg = roadMatrixLeg(matrix, 1, 0);
  const density = portfolioDensityFromDistances(
    locations.portfolioProperties.map((property, index) => {
      const matrixIndex = index + 2;
      const outbound = roadMatrixLeg(matrix, 1, matrixIndex);
      const inbound = roadMatrixLeg(matrix, matrixIndex, 1);
      return {
        propertyId: property.id || null,
        propertyName: property.name || "Portfolio property",
        distanceMiles: (outbound.miles + inbound.miles) / 2,
      };
    }),
    policy
  );
  const route = roadMatrixRoute(
    locations.homeBase,
    locations.portfolioProperties,
    matrix
  );
  const insertion = bestRoadMatrixInsertion(route, matrix);
  const confidence = !locations.portfolioProperties.length || routeCommitment === "none"
    ? 0
    : routeCommitment === "confirmed" ? 1 : policy.modeledRouteConfidence;
  const roundTripMiles = outboundHomeLeg.miles + returnHomeLeg.miles;
  const roundTripMinutes = outboundHomeLeg.minutes + returnHomeLeg.minutes;

  return {
    method: "road_matrix",
    provider: matrix.provider || "unknown",
    profile: matrix.profile || "driving",
    candidate: {
      id: locations.candidate.id || null,
      name: locations.candidate.name || "Proposed property",
      lat: locations.candidate.lat,
      lng: locations.candidate.lng,
    },
    home: {
      oneWayAirMiles: roundMetric(haversineMiles(locations.homeBase, locations.candidate)),
      oneWayRoadMiles: roundMetric(outboundHomeLeg.miles),
      oneWayMinutes: roundMetric(outboundHomeLeg.minutes),
      roundTripMiles: roundMetric(roundTripMiles),
      roundTripMinutes: roundMetric(roundTripMinutes),
    },
    portfolio: {
      propertyCount: locations.portfolioProperties.length,
      densityScore: Number(density.densityScore.toFixed(4)),
      nearestPropertyDistanceMiles: density.nearestPropertyDistanceMiles == null
        ? null
        : roundMetric(density.nearestPropertyDistanceMiles),
      nearbyProperties: density.nearbyProperties.map((property) => ({
        ...property,
        distanceMiles: roundMetric(property.distanceMiles),
      })),
    },
    route: {
      commitment: routeCommitment,
      confidence,
      modeledStopCount: locations.portfolioProperties.length,
      insertionIndex: insertion?.insertionIndex ?? null,
      insertionAfterPropertyId: insertion?.afterPropertyId ?? null,
      insertionAfterPropertyName: insertion?.afterPropertyName ?? null,
      insertionBeforePropertyId: insertion?.beforePropertyId ?? null,
      insertionBeforePropertyName: insertion?.beforePropertyName ?? null,
      additionalMiles: roundMetric(insertion?.additionalMiles ?? roundTripMiles),
      additionalMinutes: roundMetric(insertion?.additionalMinutes ?? roundTripMinutes),
    },
  };
}

module.exports = {
  DEFAULT_GEOGRAPHY_POLICY,
  ROUTE_COMMITMENTS,
  normalizePoint,
  haversineMiles,
  modeledLeg,
  nearestNeighborRoute,
  bestRouteInsertion,
  portfolioDensity,
  portfolioDensityFromDistances,
  preparePricingLocations,
  pricingMatrixPoints,
  buildModeledTravelContext,
  buildRoadMatrixTravelContext,
};
