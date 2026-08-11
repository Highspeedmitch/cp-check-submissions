const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BOUTIQUE_LIMITS,
  TIER_LIMITS,
  resolveLicenseEntitlements,
  summarizeAdminSeats,
} = require("../services/licenseEntitlements");

test("SaaS and hybrid tiers include two, three, and five administrator seats", () => {
  assert.equal(TIER_LIMITS.tier_1.adminLimit, 2);
  assert.equal(TIER_LIMITS.tier_2.adminLimit, 3);
  assert.equal(TIER_LIMITS.tier_3.adminLimit, 5);
  assert.equal(resolveLicenseEntitlements({ serviceModel: "platform", license: { tier: "tier_2" } }).adminLimit, 3);
  assert.equal(resolveLicenseEntitlements({ serviceModel: "hybrid", license: { tier: "tier_3" } }).adminLimit, 5);
});

test("service plans expose their recurring organization fees", () => {
  assert.equal(resolveLicenseEntitlements({ serviceModel: "platform", license: { tier: "tier_1" } }).recurringMonthlyFeeCents, 30000);
  assert.equal(resolveLicenseEntitlements({ serviceModel: "platform", license: { tier: "tier_2" } }).recurringMonthlyFeeCents, 70000);
  assert.equal(resolveLicenseEntitlements({ serviceModel: "hybrid", license: { tier: "tier_3" } }).recurringMonthlyFeeCents, 100000);

  const managed = resolveLicenseEntitlements({ serviceModel: "managed" });
  assert.equal(managed.recurringMonthlyFeeCents, 50000);
  assert.equal(managed.currency, "USD");
  assert.equal(managed.visitChargesBilledSeparately, true);
  assert.equal(resolveLicenseEntitlements({ serviceModel: "platform" }).visitChargesBilledSeparately, false);
});

test("managed service administrator seats are unmetered", () => {
  const entitlements = resolveLicenseEntitlements({
    serviceModel: "managed",
    license: { tier: "tier_1", adminLimit: 2 },
  });
  assert.equal(entitlements.unmeteredAdmins, true);
  assert.equal(entitlements.adminLimit, null);
  assert.equal(entitlements.tier, null);
  assert.equal(entitlements.afterlightPortfolioMinimumPercent, null);
});

test("Boutique has fixed untiered capacity, visit billing, and no portfolio reporting", () => {
  assert.deepEqual(BOUTIQUE_LIMITS, {
    adminLimit: 1,
    userLimit: 2,
    propertyLimit: 3,
  });
  const entitlements = resolveLicenseEntitlements({
    serviceModel: "boutique",
    license: {
      tier: "tier_3",
      adminLimit: 99,
      userLimit: 99,
      propertyLimit: 99,
    },
  });
  assert.equal(entitlements.label, "Boutique service");
  assert.equal(entitlements.tier, null);
  assert.equal(entitlements.unmeteredAdmins, false);
  assert.equal(entitlements.adminLimit, 1);
  assert.equal(entitlements.userLimit, 2);
  assert.equal(entitlements.propertyLimit, 3);
  assert.equal(entitlements.recurringMonthlyFeeCents, 7500);
  assert.equal(entitlements.currency, "USD");
  assert.equal(entitlements.visitChargesBilledSeparately, true);
  assert.equal(entitlements.afterlightPortfolioMinimumPercent, null);
  assert.equal(entitlements.portfolioReportingIncluded, false);
  assert.equal(entitlements.monthlyExecutiveSummaryIncluded, false);

  for (const serviceModel of ["platform", "managed", "hybrid"]) {
    const tier = ["platform", "hybrid"].includes(serviceModel) ? "tier_1" : null;
    const plan = resolveLicenseEntitlements({ serviceModel, license: { tier } });
    assert.equal(plan.portfolioReportingIncluded, true);
    assert.equal(plan.monthlyExecutiveSummaryIncluded, true);
  }
});

test("hybrid tiers expose their contracted Afterlight portfolio minimum", () => {
  assert.equal(resolveLicenseEntitlements({ serviceModel: "hybrid", license: { tier: "tier_1" } }).afterlightPortfolioMinimumPercent, 15);
  assert.equal(resolveLicenseEntitlements({ serviceModel: "hybrid", license: { tier: "tier_2" } }).afterlightPortfolioMinimumPercent, 12);
  assert.equal(resolveLicenseEntitlements({ serviceModel: "hybrid", license: { tier: "tier_3" } }).afterlightPortfolioMinimumPercent, 10);
  assert.equal(resolveLicenseEntitlements({ serviceModel: "platform", license: { tier: "tier_1" } }).afterlightPortfolioMinimumPercent, null);
});

test("pending administrator invitations reserve licensed seats", () => {
  const summary = summarizeAdminSeats({
    organization: { serviceModel: "platform", license: { tier: "tier_1" } },
    administrators: [{ role: "admin", accountStatus: "active", organizationArchivedAt: null }],
    invitations: [{ role: "admin", status: "pending", expiresAt: "2026-08-10T00:00:00.000Z" }],
    now: new Date("2026-08-05T00:00:00.000Z"),
  });
  assert.deepEqual({
    active: summary.active,
    pending: summary.pending,
    allocated: summary.allocated,
    remaining: summary.remaining,
  }, { active: 1, pending: 1, allocated: 2, remaining: 0 });
});

test("expired invitations and inactive administrators do not consume seats", () => {
  const summary = summarizeAdminSeats({
    organization: { serviceModel: "hybrid", license: { tier: "tier_2" } },
    administrators: [
      { role: "admin", accountStatus: "active", organizationArchivedAt: null },
      { role: "admin", accountStatus: "inactive", organizationArchivedAt: null },
    ],
    invitations: [{ role: "admin", status: "pending", expiresAt: "2026-08-01T00:00:00.000Z" }],
    now: new Date("2026-08-05T00:00:00.000Z"),
  });
  assert.equal(summary.limit, 3);
  assert.equal(summary.allocated, 1);
  assert.equal(summary.remaining, 2);
});
