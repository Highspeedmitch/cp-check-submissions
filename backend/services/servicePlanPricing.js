const PLAN_CURRENCY = "USD";
const { BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS } = require("./boutiquePolicy");

const TIER_RECURRING_MONTHLY_PRICES_CENTS = Object.freeze({
  tier_1: 30000,
  tier_2: 70000,
  tier_3: 100000,
});

const MANAGED_SERVICE_BASE_MONTHLY_CENTS = 50000;

function resolveServicePlanPricing(serviceModel, tier) {
  const managed = serviceModel === "managed";
  const boutique = serviceModel === "boutique";
  return {
    currency: PLAN_CURRENCY,
    recurringMonthlyFeeCents: boutique
      ? BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS
      : managed
        ? MANAGED_SERVICE_BASE_MONTHLY_CENTS
        : TIER_RECURRING_MONTHLY_PRICES_CENTS[tier] ?? null,
    visitChargesBilledSeparately: ["boutique", "managed", "hybrid"].includes(serviceModel),
  };
}

module.exports = {
  PLAN_CURRENCY,
  TIER_RECURRING_MONTHLY_PRICES_CENTS,
  MANAGED_SERVICE_BASE_MONTHLY_CENTS,
  BOUTIQUE_SERVICE_BASE_MONTHLY_CENTS,
  resolveServicePlanPricing,
};
