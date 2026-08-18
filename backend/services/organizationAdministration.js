const CUSTOMER_MANAGED = "customer_managed";
const PLATFORM_MANAGED = "platform_managed";
const ORGANIZATION_ADMINISTRATION_MODES = new Set([
  CUSTOMER_MANAGED,
  PLATFORM_MANAGED,
]);

const PLATFORM_MANAGED_GRANT_PURPOSES = new Set([
  "add_property",
  "remove_property",
  "update_fulfillment_policy",
  "bulk_onboarding",
]);

function normalizeOrganizationAdministrationMode(value) {
  const mode = String(value || CUSTOMER_MANAGED).trim().toLowerCase();
  if (!ORGANIZATION_ADMINISTRATION_MODES.has(mode)) {
    const error = new Error("Select a valid organization administration mode.");
    error.status = 400;
    error.code = "INVALID_ORGANIZATION_ADMINISTRATION_MODE";
    throw error;
  }
  return mode;
}

function organizationAdministrationMode(organization) {
  return normalizeOrganizationAdministrationMode(organization?.administration?.mode);
}

function isPlatformManagedOrganization(organization) {
  return organizationAdministrationMode(organization) === PLATFORM_MANAGED;
}

function isPlatformManagedAdminView(user) {
  return Boolean(
    user?.assumedOrganization
    && user?.platformRole === "platform_admin"
    && user?.organizationAdministrationMode === PLATFORM_MANAGED
  );
}

module.exports = {
  CUSTOMER_MANAGED,
  PLATFORM_MANAGED,
  ORGANIZATION_ADMINISTRATION_MODES,
  PLATFORM_MANAGED_GRANT_PURPOSES,
  normalizeOrganizationAdministrationMode,
  organizationAdministrationMode,
  isPlatformManagedOrganization,
  isPlatformManagedAdminView,
};
