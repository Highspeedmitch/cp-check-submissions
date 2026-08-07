export const ORGANIZATION_ROLE_OPTIONS = [
  { value: "user", label: "Field Operator" },
  { value: "property_manager", label: "Property Manager" },
  { value: "client", label: "Property Owner" },
  { value: "cleaner", label: "Cleaner" },
];

export const CUSTOMER_ENGAGEMENT_OPTIONS = [
  { value: "customer_employee", label: "Customer Employee" },
  { value: "customer_contractor", label: "Customer Contractor" },
];

export function inferredCustomerEngagementType(user = {}) {
  if (CUSTOMER_ENGAGEMENT_OPTIONS.some((option) => option.value === user.engagementType)) {
    return user.engagementType;
  }
  if (user.role === "contractor") return "customer_contractor";
  if (user.role === "user") return "customer_employee";
  return "";
}

export function normalizeOrganizationUserForEditing(user) {
  if (!user) return null;
  return {
    ...user,
    role: user.role === "contractor" ? "user" : user.role,
    engagementType: inferredCustomerEngagementType(user),
  };
}

export function organizationRoleLabel(role) {
  if (role === "contractor") return "Field Operator";
  return ORGANIZATION_ROLE_OPTIONS.find((option) => option.value === role)?.label
    || String(role || "User").replaceAll("_", " ");
}

export function customerEngagementLabel(value) {
  return CUSTOMER_ENGAGEMENT_OPTIONS.find((option) => option.value === value)?.label
    || "Not scheduled";
}

export function roleRequiresCustomerEngagement(role) {
  return ["user", "cleaner"].includes(role);
}

export function customerEngagementMatchesFulfillment(user, fulfillmentSource) {
  return inferredCustomerEngagementType(user) === fulfillmentSource;
}
