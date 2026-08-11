const MAX_ROUTE_PROPERTIES = 6;
const MIN_ROUTE_PROPERTIES = 2;
const UNCATEGORIZED_REGION = "Uncategorized";
const OPERATIONAL_ROLES = new Set(["user", "contractor", "cleaner"]);
const ROUTE_ASSIGNABLE_ROLES = new Set(["property_manager", ...OPERATIONAL_ROLES]);

function sameId(first, second) {
  return first != null && second != null && String(first) === String(second);
}

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function normalizeRegion(value, { defaultValue = UNCATEGORIZED_REGION } = {}) {
  const region = String(value || "").trim().replace(/\s+/g, " ");
  if (!region) return defaultValue;
  if (region.length > 100) {
    const error = new Error("Region names must be 100 characters or fewer.");
    error.status = 400;
    throw error;
  }
  return region;
}

function isUncategorizedRegion(value) {
  return normalizeRegion(value).toLowerCase() === UNCATEGORIZED_REGION.toLowerCase();
}

function activeRoutes(organization) {
  return (organization?.routes || []).filter((route) => route.status !== "archived");
}

function findRoute(organization, routeId, { includeArchived = false } = {}) {
  const route = (organization?.routes || []).find((candidate) => sameId(candidate._id, routeId));
  if (!route || (!includeArchived && route.status === "archived")) return null;
  return route;
}

function propertyById(organization, propertyId) {
  return (organization?.properties || []).find((property) => sameId(property._id, propertyId)) || null;
}

function routePropertyIds(route) {
  return uniqueIds(route?.propertyIds || []);
}

function directRouteIdsForUser(organization, userId) {
  return activeRoutes(organization)
    .filter((route) => (route.assignedUserIds || []).some((id) => sameId(id, userId)))
    .map((route) => String(route._id));
}

function directPropertyIdsForUser(organization, user) {
  if (!user) return [];
  const userId = user.userId || user._id;
  if (!userId) return [];
  if (user.role === "admin") {
    return (organization?.properties || [])
      .filter((property) => property._id != null)
      .map((property) => String(property._id));
  }
  const field = user.role === "property_manager"
    ? "propertyManagers"
    : user.role === "client"
      ? "clientOwners"
      : OPERATIONAL_ROLES.has(user.role)
        ? "fieldOperators"
        : null;
  if (!field) return [];
  return (organization?.properties || [])
    .filter((property) => (property[field] || []).some((id) => sameId(id, userId)))
    .filter((property) => property._id != null)
    .map((property) => String(property._id));
}

function operationalScopeConfigured(organization, userId) {
  return (organization?.workScopeConfiguredUsers || []).some((id) => sameId(id, userId));
}

function effectivePropertyIdsForUser(organization, user) {
  if (!user) return [];
  const userId = user.userId || user._id;
  if (!userId) return [];
  if (user.role === "admin") {
    return (organization?.properties || []).map((property) => String(property._id));
  }

  const effective = new Set(directPropertyIdsForUser(organization, user));
  if (ROUTE_ASSIGNABLE_ROLES.has(user.role)) {
    for (const routeId of directRouteIdsForUser(organization, userId)) {
      const route = findRoute(organization, routeId);
      routePropertyIds(route).forEach((propertyId) => effective.add(propertyId));
    }
  }

  // Preserve the historical operational-user behavior until an administrator
  // explicitly saves that user's new property/route scope. This makes the new
  // model safe to introduce without silently removing existing DEV access.
  if (OPERATIONAL_ROLES.has(user.role) && !operationalScopeConfigured(organization, userId)) {
    for (const property of organization?.properties || []) {
      if (property._id != null && (property.propertyManagers || []).length > 0) {
        effective.add(String(property._id));
      }
    }
  }

  return [...effective];
}

function eligibleRouteIdsForUser(organization, user) {
  const effective = new Set(effectivePropertyIdsForUser(organization, user));
  return activeRoutes(organization)
    .filter((route) => routePropertyIds(route).every((propertyId) => effective.has(propertyId)))
    .map((route) => String(route._id));
}

function userScope(organization, user) {
  const userId = user?.userId || user?._id;
  return {
    directPropertyIds: directPropertyIdsForUser(organization, user),
    directRouteIds: userId ? directRouteIdsForUser(organization, userId) : [],
    effectivePropertyIds: effectivePropertyIdsForUser(organization, user),
    eligibleRouteIds: eligibleRouteIdsForUser(organization, user),
    configured: OPERATIONAL_ROLES.has(user?.role)
      ? operationalScopeConfigured(organization, userId)
      : true,
  };
}

function effectivePropertyManagerIds(organization, property) {
  const ids = new Set((property?.propertyManagers || []).map(String));
  for (const route of activeRoutes(organization)) {
    if (!routePropertyIds(route).some((propertyId) => sameId(propertyId, property?._id))) continue;
    (route.assignedUserIds || []).forEach((userId) => ids.add(String(userId)));
  }
  return [...ids];
}

function validateRouteDefinition(organization, input, { routeId = null } = {}) {
  const name = String(input?.name || "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) {
    throw new Error("Route name is required and must be 120 characters or fewer.");
  }
  const region = normalizeRegion(input?.region);
  if (isUncategorizedRegion(region)) {
    throw new Error("Assign a named region before creating a route.");
  }
  const propertyIds = uniqueIds(input?.propertyIds);
  if (propertyIds.length < MIN_ROUTE_PROPERTIES || propertyIds.length > MAX_ROUTE_PROPERTIES) {
    throw new Error(`A route must contain between ${MIN_ROUTE_PROPERTIES} and ${MAX_ROUTE_PROPERTIES} properties.`);
  }

  const properties = propertyIds.map((propertyId) => propertyById(organization, propertyId));
  if (properties.some((property) => !property)) {
    throw new Error("One or more route properties are outside this organization.");
  }
  if (properties.some((property) => normalizeRegion(property.region).toLowerCase() !== region.toLowerCase())) {
    throw new Error("Every route property must belong to the selected region.");
  }

  const duplicateName = (organization?.routes || []).some((route) => (
    !sameId(route._id, routeId)
    && route.status !== "archived"
    && String(route.name || "").trim().toLowerCase() === name.toLowerCase()
  ));
  if (duplicateName) throw new Error("An active route already uses that name.");

  const conflictingRoute = activeRoutes(organization).find((route) => (
    !sameId(route._id, routeId)
    && routePropertyIds(route).some((propertyId) => propertyIds.includes(propertyId))
  ));
  if (conflictingRoute) {
    throw new Error(`A property is already assigned to the active route ${conflictingRoute.name}.`);
  }

  return { name, region, propertyIds, properties };
}

function validateScopeSelection(organization, { role, propertyIds = [], routeIds = [] }) {
  const normalizedPropertyIds = uniqueIds(propertyIds);
  const normalizedRouteIds = uniqueIds(routeIds);
  const validProperties = new Set((organization?.properties || []).map((property) => String(property._id)));
  if (normalizedPropertyIds.some((propertyId) => !validProperties.has(propertyId))) {
    throw new Error("One or more properties are outside this organization.");
  }
  if (!ROUTE_ASSIGNABLE_ROLES.has(role) && normalizedRouteIds.length) {
    throw new Error("Routes can be assigned only to property managers and field operators.");
  }
  if (normalizedRouteIds.some((routeId) => !findRoute(organization, routeId))) {
    throw new Error("One or more selected routes are unavailable.");
  }
  return {
    propertyIds: ["property_manager", "client", ...OPERATIONAL_ROLES].includes(role)
      ? normalizedPropertyIds
      : [],
    routeIds: ROUTE_ASSIGNABLE_ROLES.has(role) ? normalizedRouteIds : [],
  };
}

function routeResult(organization, route) {
  const propertyMap = new Map((organization?.properties || []).map((property) => [
    String(property._id),
    property,
  ]));
  const propertyIds = routePropertyIds(route);
  return {
    _id: route._id,
    name: route.name,
    region: route.region,
    propertyIds,
    properties: propertyIds.map((propertyId, stopIndex) => {
      const property = propertyMap.get(propertyId);
      return property ? {
        _id: property._id,
        name: property.name,
        region: property.region,
        physicalAddress: property.physicalAddress,
        lat: property.lat,
        lng: property.lng,
        stopIndex,
      } : null;
    }).filter(Boolean),
    assignedUserIds: uniqueIds(route.assignedUserIds || []),
    status: route.status || "active",
    version: route.version || 1,
    createdAt: route.createdAt || null,
    updatedAt: route.updatedAt || null,
    archivedAt: route.archivedAt || null,
  };
}

function deploymentScopeMode(deployment) {
  if (deployment?.scopeMode === "selected") return "selected";
  if (deployment?.scopeMode === "all") return "all";
  return uniqueIds(deployment?.propertyIds || []).length
    || uniqueIds(deployment?.routeIds || []).length
    ? "selected"
    : "all";
}

function effectivePropertyIdsForDeployment(organization, deployment) {
  if (deploymentScopeMode(deployment) === "all") {
    return (organization?.properties || []).map((property) => String(property._id));
  }
  const effective = new Set(uniqueIds(deployment?.propertyIds || []));
  for (const routeId of uniqueIds(deployment?.routeIds || [])) {
    const route = findRoute(organization, routeId);
    routePropertyIds(route).forEach((propertyId) => effective.add(propertyId));
  }
  return [...effective];
}

function deploymentAllowsProperty(organization, deployment, propertyId) {
  return effectivePropertyIdsForDeployment(organization, deployment)
    .some((effectiveId) => sameId(effectiveId, propertyId));
}

module.exports = {
  MAX_ROUTE_PROPERTIES,
  MIN_ROUTE_PROPERTIES,
  OPERATIONAL_ROLES,
  ROUTE_ASSIGNABLE_ROLES,
  UNCATEGORIZED_REGION,
  activeRoutes,
  deploymentAllowsProperty,
  deploymentScopeMode,
  directPropertyIdsForUser,
  directRouteIdsForUser,
  effectivePropertyIdsForUser,
  effectivePropertyIdsForDeployment,
  effectivePropertyManagerIds,
  eligibleRouteIdsForUser,
  findRoute,
  isUncategorizedRegion,
  normalizeRegion,
  operationalScopeConfigured,
  propertyById,
  routePropertyIds,
  routeResult,
  sameId,
  uniqueIds,
  userScope,
  validateRouteDefinition,
  validateScopeSelection,
};
