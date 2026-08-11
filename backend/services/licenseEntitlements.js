const { resolveServicePlanPricing } = require("./servicePlanPricing");
const {
  BOUTIQUE_ADMIN_LIMIT,
  BOUTIQUE_MAX_PROPERTIES,
  BOUTIQUE_USER_LIMIT,
  serviceModelIncludesPortfolioReporting,
} = require("./boutiquePolicy");

const LICENSE_TIERS = ["tier_1", "tier_2", "tier_3"];
const METERED_SERVICE_MODELS = new Set(["platform", "hybrid"]);

const TIER_LIMITS = Object.freeze({
  tier_1: Object.freeze({ adminLimit: 2, userLimit: 5, propertyLimit: 10 }),
  tier_2: Object.freeze({ adminLimit: 3, userLimit: 20, propertyLimit: 50 }),
  tier_3: Object.freeze({ adminLimit: 5, userLimit: 50, propertyLimit: 250 }),
});
const HYBRID_PORTFOLIO_MINIMUMS = Object.freeze({
  tier_1: 15,
  tier_2: 12,
  tier_3: 10,
});
const BOUTIQUE_LIMITS = Object.freeze({
  adminLimit: BOUTIQUE_ADMIN_LIMIT,
  userLimit: BOUTIQUE_USER_LIMIT,
  propertyLimit: BOUTIQUE_MAX_PROPERTIES,
});

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizedTier(serviceModel, value) {
  if (!METERED_SERVICE_MODELS.has(serviceModel)) return null;
  return LICENSE_TIERS.includes(value) ? value : "tier_1";
}

function minimumAdminLimit(value) {
  return isPositiveInteger(value) ? Math.max(2, value) : null;
}

function resolveLicenseEntitlements(organization = {}) {
  const serviceModel = ["platform", "managed", "hybrid", "boutique"].includes(organization.serviceModel)
    ? organization.serviceModel
    : "managed";
  const tier = normalizedTier(serviceModel, organization.license?.tier);
  const managed = serviceModel === "managed";
  const boutique = serviceModel === "boutique";
  const defaults = boutique ? BOUTIQUE_LIMITS : tier ? TIER_LIMITS[tier] : {
    adminLimit: null,
    userLimit: null,
    propertyLimit: null,
  };
  const configuredAdminLimit = boutique
    ? BOUTIQUE_ADMIN_LIMIT
    : minimumAdminLimit(organization.license?.adminLimit);
  const configuredUserLimit = isPositiveInteger(organization.license?.userLimit)
    ? organization.license.userLimit
    : null;
  const configuredPropertyLimit = isPositiveInteger(organization.license?.propertyLimit)
    ? organization.license.propertyLimit
    : null;
  const pricing = resolveServicePlanPricing(serviceModel, tier);

  return {
    serviceModel,
    tier,
    unmeteredAdmins: managed,
    adminLimit: managed ? null : boutique ? BOUTIQUE_ADMIN_LIMIT : configuredAdminLimit || defaults.adminLimit,
    userLimit: managed ? null : boutique ? BOUTIQUE_USER_LIMIT : configuredUserLimit || defaults.userLimit,
    propertyLimit: managed ? null : boutique ? BOUTIQUE_MAX_PROPERTIES : configuredPropertyLimit || defaults.propertyLimit,
    afterlightPortfolioMinimumPercent: serviceModel === "hybrid"
      ? HYBRID_PORTFOLIO_MINIMUMS[tier]
      : null,
    ...pricing,
    portfolioReportingIncluded: serviceModelIncludesPortfolioReporting(serviceModel),
    monthlyExecutiveSummaryIncluded: serviceModelIncludesPortfolioReporting(serviceModel),
    label: boutique
      ? "Boutique service"
      : managed
        ? "Managed service"
        : `${serviceModel === "platform" ? "Full Stack SaaS" : "Hybrid"} Tier ${tier.slice(-1)}`,
  };
}

function defaultStoredLicense(serviceModel, tier) {
  const entitlements = resolveLicenseEntitlements({ serviceModel, license: { tier } });
  return {
    tier: entitlements.tier,
    adminLimit: entitlements.adminLimit,
    userLimit: entitlements.userLimit,
    propertyLimit: entitlements.propertyLimit,
    adminSeatVersion: 0,
    capacityVersion: 0,
  };
}

function activeAdministratorCount(administrators = []) {
  return administrators.filter((administrator) =>
    administrator?.role === "admin"
    && administrator?.accountStatus !== "inactive"
    && !administrator?.organizationArchivedAt
  ).length;
}

function pendingAdministratorCount(invitations = [], now = new Date()) {
  return invitations.filter((invitation) =>
    invitation?.role === "admin"
    && invitation?.status === "pending"
    && new Date(invitation.expiresAt).getTime() > now.getTime()
  ).length;
}

function summarizeAdminSeats({ organization, administrators = [], invitations = [], now = new Date() }) {
  const active = activeAdministratorCount(administrators);
  const pending = pendingAdministratorCount(invitations, now);
  return summarizeAdminSeatCounts({ organization, active, pending });
}

function summarizeAdminSeatCounts({ organization, active = 0, pending = 0 }) {
  const entitlements = resolveLicenseEntitlements(organization);
  const allocated = active + pending;
  const limit = entitlements.adminLimit;

  return {
    limit,
    active,
    pending,
    allocated,
    remaining: limit === null ? null : Math.max(0, limit - allocated),
    unmetered: entitlements.unmeteredAdmins,
    overLimit: limit === null ? false : allocated > limit,
    tier: entitlements.tier,
    planLabel: entitlements.label,
    recurringMonthlyFeeCents: entitlements.recurringMonthlyFeeCents,
    currency: entitlements.currency,
    visitChargesBilledSeparately: entitlements.visitChargesBilledSeparately,
  };
}

function adminLimitError(summary) {
  const error = new Error("This organization has used all of its administrator seats.");
  error.status = 409;
  error.code = "ADMIN_LIMIT_REACHED";
  error.adminSeats = summary;
  return error;
}

module.exports = {
  LICENSE_TIERS,
  METERED_SERVICE_MODELS,
  TIER_LIMITS,
  BOUTIQUE_LIMITS,
  HYBRID_PORTFOLIO_MINIMUMS,
  normalizedTier,
  resolveLicenseEntitlements,
  defaultStoredLicense,
  activeAdministratorCount,
  pendingAdministratorCount,
  summarizeAdminSeats,
  summarizeAdminSeatCounts,
  adminLimitError,
};
