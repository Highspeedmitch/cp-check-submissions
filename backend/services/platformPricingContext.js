const { AFTERLIGHT_FULFILLMENT_SOURCES, propertyDefaultSource } = require("./fulfillmentPolicy");
const {
  buildModeledTravelContext,
  buildRoadMatrixTravelContext,
  pricingMatrixPoints,
} = require("./pricingGeography");

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

function buildOrganizationTravelContext({
  organization,
  candidate,
  routeCommitment = "modeled",
  homeBase = operationsBaseFromEnvironment(),
}) {
  if (!organization) throw new Error("Select an organization for portfolio-aware pricing.");
  return buildModeledTravelContext({
    homeBase,
    candidate,
    portfolioProperties: routeEligiblePortfolioProperties(organization),
    routeCommitment,
  });
}

async function resolveOrganizationTravelContext({
  organization,
  candidate,
  routeCommitment = "modeled",
  homeBase = operationsBaseFromEnvironment(),
  routingClient,
}) {
  if (!organization) throw new Error("Select an organization for portfolio-aware pricing.");
  const portfolioProperties = routeEligiblePortfolioProperties(organization);
  const matrixPoints = pricingMatrixPoints({
    homeBase,
    candidate,
    portfolioProperties,
  });
  try {
    if (!routingClient?.getDrivingMatrix) throw new Error("Road routing client unavailable.");
    const matrix = await routingClient.getDrivingMatrix(matrixPoints);
    return buildRoadMatrixTravelContext({
      homeBase,
      candidate,
      portfolioProperties,
      routeCommitment,
      matrix,
    });
  } catch (routingError) {
    const fallback = buildModeledTravelContext({
      homeBase,
      candidate,
      portfolioProperties,
      routeCommitment,
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
  buildOrganizationTravelContext,
  resolveOrganizationTravelContext,
};
