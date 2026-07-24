function managedProperties(organization, user) {
  if (user.role === "admin") return organization.properties;
  if (user.role !== "property_manager") return organization.properties;
  return organization.properties.filter((property) =>
    property.propertyManagers?.some((id) => id.toString() === user.userId.toString())
  );
}

function canAccessProperty(property, user) {
  return user.role === "admin"
    || user.role !== "property_manager"
    || property.propertyManagers?.some((id) => id.toString() === user.userId.toString());
}

module.exports = { managedProperties, canAccessProperty };
