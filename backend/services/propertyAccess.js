const {
  effectivePropertyIdsForUser,
  effectivePropertyManagerIds,
} = require("./routeScopes");

function managedProperties(organization, user) {
  const effectiveIds = new Set(effectivePropertyIdsForUser(organization, user));
  return (organization?.properties || []).filter((property) => (
    property._id != null
      ? effectiveIds.has(String(property._id))
      : canAccessProperty(property, user)
  ));
}

function canAccessProperty(property, user) {
  // Retain the legacy signature for callers that only hold a property. Route
  // aware callers should pass the organization as the third argument.
  const organization = arguments[2];
  if (organization) {
    return managedProperties(organization, user)
      .some((candidate) => String(candidate._id) === String(property?._id));
  }
  if (user.role === "admin") return true;
  const field = user.role === "property_manager"
    ? "propertyManagers"
    : user.role === "client"
      ? "clientOwners"
      : ["user", "contractor", "cleaner"].includes(user.role)
        ? "fieldOperators"
        : null;
  if (!field) return false;
  if (["user", "contractor", "cleaner"].includes(user.role)
    && !(property[field] || []).length) {
    return (property.propertyManagers || []).length > 0;
  }
  return Boolean((property[field] || []).some(
    (id) => id.toString() === user.userId.toString()
  ));
}

module.exports = { managedProperties, canAccessProperty, effectivePropertyManagerIds };
