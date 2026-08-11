const { AFTERLIGHT_FULFILLMENT_SOURCES, propertyDefaultSource } = require("./fulfillmentPolicy");
const {
  buildModeledTravelContext,
  buildRoadMatrixTravelContext,
  pricingMatrixPoints,
} = require("./pricingGeography");
const {
  MAX_ROUTE_PROPERTIES,
  findRoute,
  routePropertyIds,
} = require("./routeScopes");

function pricingContextError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function operationsBaseFromEnvironment(environment = process.env) {
  const rawLat = environment.AFTERLIGHT_PRICING_HOME_LAT;
  const rawLng = environment.AFTERLIGHT_PRICING_HOME_LNG;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (rawLat === "" || rawLat === null || rawLat === undefined
    || rawLng === "" || rawLng === null || rawLng === undefined
    || !Number.isFinite(lat) || lat < -90 || lat > 90
    || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    const error = new Error("The Tucson operations base is not configured for route-aware pricing.");
    error.code = "PRICING_HOME_BASE_NOT_CONFIGURED";
    error.status = 503;
    throw error;
  }
  return { id: "operations_base", name: "Tucson operations base", lat, lng };
}

function routeEligiblePortfolioProperties(organization) {
  return (organization?.properties || []).filter((property) => (
    property.lat !== "" && property.lat !== null && property.lat !== undefined
    && property.lng !== "" && property.lng !== null && property.lng !== undefined
    && Number.isFinite(Number(property.lat))
    && Number.isFinite(Number(property.lng))
    && AFTERLIGHT_FULFILLMENT_SOURCES.includes(propertyDefaultSource(organization, property))
  )).map((property) => ({
    id: String(property._id || property.id || property.name),
    name: property.name,
    lat: Number(property.lat),
    lng: Number(property.lng),
  }));
}

function pricingRouteScope(organization, routeId) {
  if (!routeId) {
    return {
      portfolioProperties: [],
      routeCommitment: "none",
      routeMetadata: {
        source: "standalone",
        routeId: null,
        routeName: null,
        routeRegion: null,
        routeVersion: null,
        stopCount: 0,
        maximumStops: MAX_ROUTE_PROPERTIES,
        capacityRemaining: MAX_ROUTE_PROPERTIES,
      },
    };
  }

  const route = findRoute(organization, routeId);
  if (!route) {
    throw pricingContextError("Select an active property route or standalone trip.");
  }
  const propertyIds = routePropertyIds(route);
  if (propertyIds.length >= MAX_ROUTE_PROPERTIES) {
    throw pricingContextError(
      `${route.name || "This route"} already contains the maximum of ${MAX_ROUTE_PROPERTIES} properties.`,
      409
    );
  }

  const propertiesById = new Map((organization?.properties || []).map((property) => [
    String(property._id || property.id),
    property,
  ]));
  const portfolioProperties = propertyIds.map((propertyId) => {
    const property = propertiesById.get(propertyId);
    if (!property) {
      throw pricingContextError(`${route.name || "The selected route"} contains an unavailable property.`);
    }
    const coordinatesValid = property.lat !== "" && property.lat !== null
      && property.lat !== undefined && property.lng !== "" && property.lng !== null
      && property.lng !== undefined && Number.isFinite(Number(property.lat))
      && Number.isFinite(Number(property.lng));
    if (!coordinatesValid) {
      throw pricingContextError(`${property.name || "A route property"} needs valid coordinates before this route can be priced.`);
    }
    if (!AFTERLIGHT_FULFILLMENT_SOURCES.includes(propertyDefaultSource(organization, property))) {
      throw pricingContextError(`${property.name || "A route property"} is not fulfilled by Afterlight and cannot be used for route pricing.`);
    }
    return {
      id: String(property._id || property.id || property.name),
      name: property.name,
      lat: Number(property.lat),
      lng: Number(property.lng),
    };
  });

  return {
    portfolioProperties,
    routeCommitment: null,
    routeMetadata: {
      source: "saved_route",
      routeId: String(route._id),
      routeName: route.name,
      routeRegion: route.region,
      routeVersion: Number(route.version) || 1,
      stopCount: propertyIds.length,
      maximumStops: MAX_ROUTE_PROPERTIES,
      capacityRemaining: MAX_ROUTE_PROPERTIES - propertyIds.length,
    },
  };
}

function buildOrganizationTravelContext({
  organization,
  candidate,
  routeId = null,
  routeCommitment = "modeled",
  homeBase = operationsBaseFromEnvironment(),
}) {
  if (!organization) throw new Error("Select an organization for route-aware pricing.");
  const scope = pricingRouteScope(organization, routeId);
  return buildModeledTravelContext({
    homeBase,
    candidate,
    portfolioProperties: scope.portfolioProperties,
    routeCommitment: scope.routeCommitment || routeCommitment,
    preservePortfolioOrder: true,
    routeMetadata: scope.routeMetadata,
  });
}

async function resolveOrganizationTravelContext({
  organization,
  candidate,
  routeId = null,
  routeCommitment = "modeled",
  homeBase = operationsBaseFromEnvironment(),
  routingClient,
}) {
  if (!organization) throw new Error("Select an organization for route-aware pricing.");
  const scope = pricingRouteScope(organization, routeId);
  const portfolioProperties = scope.portfolioProperties;
  const effectiveCommitment = scope.routeCommitment || routeCommitment;
  const matrixPoints = pricingMatrixPoints({
    homeBase,
    candidate,
    portfolioProperties,
    preservePortfolioOrder: true,
  });
  try {
    if (!routingClient?.getDrivingMatrix) throw new Error("Road routing client unavailable.");
    const matrix = await routingClient.getDrivingMatrix(matrixPoints);
    return buildRoadMatrixTravelContext({
      homeBase,
      candidate,
      portfolioProperties,
      routeCommitment: effectiveCommitment,
      matrix,
      preservePortfolioOrder: true,
      routeMetadata: scope.routeMetadata,
    });
  } catch (routingError) {
    const fallback = buildModeledTravelContext({
      homeBase,
      candidate,
      portfolioProperties,
      routeCommitment: effectiveCommitment,
      preservePortfolioOrder: true,
      routeMetadata: scope.routeMetadata,
    });
    fallback.providerFallback = {
      code: String(routingError?.code || "PRICING_ROUTING_UNAVAILABLE"),
    };
    return fallback;
  }
}

module.exports = {
  operationsBaseFromEnvironment,
  routeEligiblePortfolioProperties,
  pricingRouteScope,
  buildOrganizationTravelContext,
  resolveOrganizationTravelContext,
};
