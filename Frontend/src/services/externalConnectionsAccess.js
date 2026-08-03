export const ASSIGNABLE_ORGANIZATION_ROLES = ["user", "contractor", "cleaner"];

export function canAccessExternalConnections({ role, accountScope }) {
  return accountScope === "afterlight_resource"
    || ASSIGNABLE_ORGANIZATION_ROLES.includes(role);
}
