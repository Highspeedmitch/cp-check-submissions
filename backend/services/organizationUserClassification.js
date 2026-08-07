const CUSTOMER_ENGAGEMENT_TYPES = ["customer_employee", "customer_contractor"];
const ORGANIZATION_ACCESS_ROLES = ["user", "property_manager", "client", "cleaner"];
const LEGACY_ORGANIZATION_ROLES = ["contractor"];

function classificationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function inferredCustomerEngagementType(userOrRole) {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole?.role;
  const explicit = typeof userOrRole === "string" ? null : userOrRole?.engagementType;
  if (CUSTOMER_ENGAGEMENT_TYPES.includes(explicit)) return explicit;
  if (role === "contractor") return "customer_contractor";
  if (role === "user") return "customer_employee";
  return null;
}

function normalizeOrganizationUserClassification({ role, engagementType } = {}) {
  const requestedRole = String(role || "").trim().toLowerCase();
  const normalizedRole = ["field_operator", "contractor"].includes(requestedRole)
    ? "user"
    : requestedRole;
  if (!ORGANIZATION_ACCESS_ROLES.includes(normalizedRole)) {
    throw classificationError("Select a valid organization access role.");
  }

  const requestedEngagement = String(engagementType || "").trim().toLowerCase();
  let normalizedEngagement = requestedEngagement || inferredCustomerEngagementType(requestedRole);
  if (normalizedEngagement && !CUSTOMER_ENGAGEMENT_TYPES.includes(normalizedEngagement)) {
    throw classificationError("Select Customer Employee, Customer Contractor, or Not scheduled.");
  }
  if (["user", "cleaner"].includes(normalizedRole) && !normalizedEngagement) {
    throw classificationError("Select whether this field worker is a Customer Employee or Customer Contractor.");
  }
  if (!normalizedEngagement) normalizedEngagement = null;
  return { role: normalizedRole, engagementType: normalizedEngagement };
}

function customerEngagementMatchesFulfillment(user, fulfillmentSource) {
  if (!CUSTOMER_ENGAGEMENT_TYPES.includes(fulfillmentSource)) return false;
  return inferredCustomerEngagementType(user) === fulfillmentSource;
}

function customerEngagementLabel(value) {
  return ({
    customer_employee: "Customer Employee",
    customer_contractor: "Customer Contractor",
  })[value] || "Not scheduled";
}

module.exports = {
  CUSTOMER_ENGAGEMENT_TYPES,
  ORGANIZATION_ACCESS_ROLES,
  LEGACY_ORGANIZATION_ROLES,
  customerEngagementLabel,
  customerEngagementMatchesFulfillment,
  inferredCustomerEngagementType,
  normalizeOrganizationUserClassification,
};
