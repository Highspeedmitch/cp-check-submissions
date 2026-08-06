const { defaultStoredLicense, resolveLicenseEntitlements } = require("./licenseEntitlements");

function storedLicenseSnapshot(organization = {}) {
  return {
    tier: organization.license?.tier ?? null,
    adminLimit: organization.license?.adminLimit ?? null,
    userLimit: organization.license?.userLimit ?? null,
    propertyLimit: organization.license?.propertyLimit ?? null,
    adminSeatVersion: Number(organization.license?.adminSeatVersion || 0),
    capacityVersion: Number(organization.license?.capacityVersion || 0),
  };
}

function desiredStoredLicense(organization = {}) {
  const resolved = resolveLicenseEntitlements(organization);
  const defaults = defaultStoredLicense(resolved.serviceModel, resolved.tier);
  return {
    tier: resolved.tier,
    adminLimit: resolved.adminLimit,
    userLimit: resolved.userLimit,
    propertyLimit: resolved.propertyLimit,
    adminSeatVersion: Number(organization.license?.adminSeatVersion || defaults.adminSeatVersion),
    capacityVersion: Number(organization.license?.capacityVersion || defaults.capacityVersion),
  };
}

function planOrganizationLicenseBackfill(organization = {}) {
  const previous = storedLicenseSnapshot(organization);
  const next = desiredStoredLicense(organization);
  return {
    organizationId: organization._id,
    name: organization.name,
    serviceModel: organization.serviceModel || "managed",
    previous,
    next,
    changed: JSON.stringify(previous) !== JSON.stringify(next),
  };
}

async function backfillOrganizationLicenses({ OrganizationModel, apply = false, now = new Date() }) {
  const organizations = await OrganizationModel.find({ workspaceType: { $ne: "afterlight_workforce" } });
  const plans = [];
  for (const organization of organizations) {
    const plan = planOrganizationLicenseBackfill(organization);
    plans.push(plan);
    if (!apply || !plan.changed) continue;
    organization.license = {
      ...plan.next,
      updatedAt: now,
      updatedBy: null,
    };
    await organization.save();
  }
  return plans;
}

module.exports = {
  storedLicenseSnapshot,
  desiredStoredLicense,
  planOrganizationLicenseBackfill,
  backfillOrganizationLicenses,
};
