function managedProperties(organization, user) {
  if (user.role === "admin") return organization.properties;
  if (user.role === "property_manager") {
    return organization.properties.filter((property) =>
      property.propertyManagers?.some((id) => id.toString() === user.userId.toString())
    );
  }
  if (["user", "contractor", "cleaner"].includes(user.role)) {
    return organization.properties.filter(
      (property) => (property.propertyManagers || []).length > 0
    );
  }
  if (user.role === "client") {
    return organization.properties.filter((property) =>
      property.clientOwners?.some((id) => id.toString() === user.userId.toString())
    );
  }
  return [];
}

function canAccessProperty(property, user) {
  if (user.role === "admin") return true;
  if (user.role === "property_manager") {
    return Boolean(property.propertyManagers?.some(
      (id) => id.toString() === user.userId.toString()
    ));
  }
  if (["user", "contractor", "cleaner"].includes(user.role)) {
    return (property.propertyManagers || []).length > 0;
  }
  if (user.role === "client") {
    return Boolean(property.clientOwners?.some(
      (id) => id.toString() === user.userId.toString()
    ));
  }
  return false;
}

module.exports = { managedProperties, canAccessProperty };
