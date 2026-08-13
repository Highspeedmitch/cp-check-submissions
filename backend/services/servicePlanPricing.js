const PLAN_CURRENCY = "USD";
const { BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS } = require("./boutiquePolicy");

const SOFTWARE_TIER_RECURRING_MONTHLY_PRICES_CENTS = Object.freeze({
  tier_1: 30000,
  tier_2: 70000,
  tier_3: 100000,
});

const MANAGED_TIER_RECURRING_MONTHLY_PRICES_CENTS = Object.freeze({
  tier_1: 50000,
  tier_2: 125000,
  tier_3: 250000,
});

const SERVICE_MODEL_TIER_RECURRING_MONTHLY_PRICES_CENTS = Object.freeze({
  platform: SOFTWARE_TIER_RECURRING_MONTHLY_PRICES_CENTS,
  hybrid: SOFTWARE_TIER_RECURRING_MONTHLY_PRICES_CENTS,
  managed: MANAGED_TIER_RECURRING_MONTHLY_PRICES_CENTS,
});

// Compatibility aliases for callers that need the entry Managed price or the
// shared SaaS/Hybrid schedule.
const TIER_RECURRING_MONTHLY_PRICES_CENTS = SOFTWARE_TIER_RECURRING_MONTHLY_PRICES_CENTS;
const MANAGED_SERVICE_BASE_MONTHLY_CENTS = MANAGED_TIER_RECURRING_MONTHLY_PRICES_CENTS.tier_1;

function resolveServicePlanPricing(serviceModel, tier) {
  const boutique = serviceModel === "boutique";
  return {
    currency: PLAN_CURRENCY,
    recurringMonthlyFeeCents: boutique
      ? BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS
      : SERVICE_MODEL_TIER_RECURRING_MONTHLY_PRICES_CENTS[serviceModel]?.[tier] ?? null,
    visitChargesBilledSeparately: ["boutique", "managed", "hybrid"].includes(serviceModel),
  };
}

module.exports = {
  PLAN_CURRENCY,
  SOFTWARE_TIER_RECURRING_MONTHLY_PRICES_CENTS,
  MANAGED_TIER_RECURRING_MONTHLY_PRICES_CENTS,
  SERVICE_MODEL_TIER_RECURRING_MONTHLY_PRICES_CENTS,
  TIER_RECURRING_MONTHLY_PRICES_CENTS,
  MANAGED_SERVICE_BASE_MONTHLY_CENTS,
  BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS,
  resolveServicePlanPricing,
};
