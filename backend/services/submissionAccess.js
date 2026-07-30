const Organization = require("../models/organization");
const { managedProperties } = require("./propertyAccess");

function isManagementRole(user) {
  return ["admin", "property_manager"].includes(user?.role);
}

async function buildSubmissionQuery({
  user,
  submittedAfter,
  OrganizationModel = Organization,
}) {
  const query = { organizationId: user.organizationId };
  if (submittedAfter) query.submittedAt = { $gte: submittedAfter };

  if (user.role === "property_manager") {
    const organization = await OrganizationModel.findById(user.organizationId);
    query.property = {
      $in: managedProperties(organization, user).map((property) => property.name),
    };
  } else if (user.role !== "admin") {
    query.userId = user.userId;
  }
  return query;
}

module.exports = { isManagementRole, buildSubmissionQuery };
