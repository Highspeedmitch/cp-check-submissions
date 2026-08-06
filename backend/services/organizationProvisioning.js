const ORGANIZATION_TYPES = new Set(["COM", "RES", "LTR", "STR"]);
const {
  SERVICE_MODEL_DEFAULTS,
  validateServiceModel,
  validateFulfillmentSource,
} = require("./fulfillmentPolicy");
const { LICENSE_TIERS, defaultStoredLicense } = require("./licenseEntitlements");

function normalizeOrganizationSetup(input = {}) {
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  const orgType = String(input.orgType || "").trim().toUpperCase();
  const reportingTimezone = String(input.reportingTimezone || "America/Phoenix").trim();
  const serviceModel = validateServiceModel(String(input.serviceModel || "managed").trim());
  const licenseTier = serviceModel === "managed"
    ? null
    : String(input.licenseTier || "tier_1").trim();
  const defaultSource = validateFulfillmentSource(
    String(input.defaultFulfillmentSource || SERVICE_MODEL_DEFAULTS[serviceModel]).trim()
  );

  if (name.length < 2 || name.length > 120) {
    throw new Error("Organization name must be between 2 and 120 characters.");
  }
  if (!ORGANIZATION_TYPES.has(orgType)) {
    throw new Error("Select a valid organization type.");
  }
  if (licenseTier && !LICENSE_TIERS.includes(licenseTier)) {
    throw new Error("Select a valid license tier.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: reportingTimezone }).format();
  } catch (error) {
    throw new Error("Select a valid reporting timezone.");
  }
  return {
    name,
    orgType,
    reportingTimezone,
    serviceModel,
    license: defaultStoredLicense(serviceModel, licenseTier),
    fulfillmentPolicy: { defaultSource, version: 1 },
    onboarding: {
      status: "invited",
      initiatedAt: new Date(),
    },
  };
}

function caseInsensitiveExact(value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}

module.exports = { ORGANIZATION_TYPES, normalizeOrganizationSetup, caseInsensitiveExact };
