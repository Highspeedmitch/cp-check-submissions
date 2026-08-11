const BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS = 7500;
const BOUTIQUE_MAX_PROPERTIES = 3;
const BOUTIQUE_MAX_PROPERTY_SQUARE_FEET_EXCLUSIVE = 5000;
const BOUTIQUE_ADMIN_LIMIT = 1;
const BOUTIQUE_USER_LIMIT = 2;
const PROPERTY_TYPES = new Set(["free_standing", "strip_mall", "individual_suite"]);

function isBoutiqueServiceModel(organizationOrServiceModel) {
  const serviceModel = typeof organizationOrServiceModel === "string"
    ? organizationOrServiceModel
    : organizationOrServiceModel?.serviceModel;
  return serviceModel === "boutique";
}

function validateBoutiqueOrganizationType(organization, { status = 409 } = {}) {
  if (!isBoutiqueServiceModel(organization)) return true;
  const orgType = String(organization?.orgType || "").trim().toUpperCase();
  if (orgType !== "COM") {
    const error = new Error("Boutique service is available only to commercial organizations.");
    error.status = status;
    error.code = "BOUTIQUE_ORGANIZATION_TYPE_NOT_ELIGIBLE";
    throw error;
  }
  return true;
}

function normalizePropertySquareFeet(value, organizationOrServiceModel, { required = false } = {}) {
  const boutique = isBoutiqueServiceModel(organizationOrServiceModel);
  const missing = value === "" || value === null || value === undefined;
  if (missing) {
    if (required || boutique) {
      const error = new Error("Gross square footage is required for Boutique properties.");
      error.status = 400;
      error.code = "BOUTIQUE_PROPERTY_SIZE_REQUIRED";
      throw error;
    }
    return null;
  }

  const squareFeet = Number(value);
  if (!Number.isInteger(squareFeet) || squareFeet <= 0) {
    const error = new Error("Gross square footage must be a positive whole number.");
    error.status = 400;
    error.code = "PROPERTY_SIZE_INVALID";
    throw error;
  }
  if (boutique && squareFeet >= BOUTIQUE_MAX_PROPERTY_SQUARE_FEET_EXCLUSIVE) {
    const error = new Error("Boutique properties must be under 5,000 square feet.");
    error.status = 409;
    error.code = "BOUTIQUE_PROPERTY_SIZE_EXCEEDED";
    throw error;
  }
  return squareFeet;
}

function normalizePropertyType(value, organizationOrServiceModel, { required = false } = {}) {
  const boutique = isBoutiqueServiceModel(organizationOrServiceModel);
  const normalized = String(value || "").trim();
  if (!normalized) {
    if (required || boutique) return "free_standing";
    return null;
  }
  if (!PROPERTY_TYPES.has(normalized)) {
    const error = new Error("Select a valid property type.");
    error.status = 400;
    error.code = "PROPERTY_TYPE_INVALID";
    throw error;
  }
  return normalized;
}

function validateBoutiquePortfolio(organization, { status = 409 } = {}) {
  if (!isBoutiqueServiceModel(organization)) return true;
  validateBoutiqueOrganizationType(organization, { status });
  const properties = Array.isArray(organization?.properties) ? organization.properties : [];
  if (properties.length > BOUTIQUE_MAX_PROPERTIES) {
    const error = new Error(`Boutique service supports no more than ${BOUTIQUE_MAX_PROPERTIES} active properties.`);
    error.status = status;
    error.code = "BOUTIQUE_PROPERTY_LIMIT_EXCEEDED";
    throw error;
  }
  for (const property of properties) {
    try {
      normalizePropertySquareFeet(property.grossSquareFeet, "boutique", { required: true });
    } catch (error) {
      error.status = status;
      error.message = `${property.name || "Every Boutique property"}: ${error.message}`;
      throw error;
    }
  }
  return true;
}

function serviceModelIncludesPortfolioReporting(organizationOrServiceModel) {
  return !isBoutiqueServiceModel(organizationOrServiceModel);
}

function requireBoutiqueInspectionAssignment(organizationOrServiceModel, assignment) {
  if (!isBoutiqueServiceModel(organizationOrServiceModel) || assignment) return true;
  const error = new Error("Boutique inspections must be completed through an assigned work item.");
  error.status = 403;
  error.code = "BOUTIQUE_ASSIGNMENT_REQUIRED";
  error.permanent = true;
  throw error;
}

module.exports = {
  BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS,
  BOUTIQUE_MAX_PROPERTIES,
  BOUTIQUE_MAX_PROPERTY_SQUARE_FEET_EXCLUSIVE,
  BOUTIQUE_ADMIN_LIMIT,
  BOUTIQUE_USER_LIMIT,
  isBoutiqueServiceModel,
  validateBoutiqueOrganizationType,
  normalizePropertySquareFeet,
  normalizePropertyType,
  validateBoutiquePortfolio,
  serviceModelIncludesPortfolioReporting,
  requireBoutiqueInspectionAssignment,
};
