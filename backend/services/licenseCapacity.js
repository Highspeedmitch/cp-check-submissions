const OrganizationInvitation = require("../models/organizationInvitation");
const User = require("../models/user");
const { resolveLicenseEntitlements } = require("./licenseEntitlements");

const CAPACITY_DIMENSIONS = Object.freeze({
  administrators: Object.freeze({
    limitKey: "adminLimit",
    code: "ADMIN_LIMIT_REACHED",
    label: "administrator seats",
  }),
  users: Object.freeze({
    limitKey: "userLimit",
    code: "USER_LIMIT_REACHED",
    label: "user seats",
  }),
  properties: Object.freeze({
    limitKey: "propertyLimit",
    code: "PROPERTY_LIMIT_REACHED",
    label: "properties",
  }),
});

const ORGANIZATION_ACCOUNT_SCOPE = {
  $or: [{ accountScope: "organization" }, { accountScope: { $exists: false } }],
};
const INVITATION_ACCOUNT_SCOPE = { accountScope: { $ne: "afterlight_resource" } };

function withSession(query, session) {
  return session && query && typeof query.session === "function" ? query.session(session) : query;
}

async function countDocuments(Model, filter, session) {
  return withSession(Model.countDocuments(filter), session);
}

async function capacitySnapshot({
  organization,
  now = new Date(),
  session,
  UserModel = User,
  InvitationModel = OrganizationInvitation,
} = {}) {
  if (!organization?._id) throw new Error("Organization is required to calculate licensed capacity.");
  const [activeAdministrators, activeUsers, pendingAdministrators, pendingUsers] = await Promise.all([
    countDocuments(UserModel, {
      organizationId: organization._id,
      role: "admin",
      accountStatus: { $ne: "inactive" },
      organizationArchivedAt: null,
      ...ORGANIZATION_ACCOUNT_SCOPE,
    }, session),
    countDocuments(UserModel, {
      organizationId: organization._id,
      role: { $ne: "admin" },
      accountStatus: { $ne: "inactive" },
      organizationArchivedAt: null,
      ...ORGANIZATION_ACCOUNT_SCOPE,
    }, session),
    countDocuments(InvitationModel, {
      organizationId: organization._id,
      role: "admin",
      status: "pending",
      expiresAt: { $gt: now },
      ...INVITATION_ACCOUNT_SCOPE,
    }, session),
    countDocuments(InvitationModel, {
      organizationId: organization._id,
      role: { $ne: "admin" },
      status: "pending",
      expiresAt: { $gt: now },
      ...INVITATION_ACCOUNT_SCOPE,
    }, session),
  ]);

  return {
    activeAdministrators,
    pendingAdministrators,
    allocatedAdministrators: activeAdministrators + pendingAdministrators,
    activeUsers,
    pendingUsers,
    allocatedUsers: activeUsers + pendingUsers,
    properties: Array.isArray(organization.properties) ? organization.properties.length : 0,
  };
}

function dimensionSummary(limit, active, pending = 0) {
  const allocated = active + pending;
  return {
    limit,
    active,
    pending,
    allocated,
    remaining: limit === null ? null : Math.max(0, limit - allocated),
    unmetered: limit === null,
    overLimit: limit === null ? false : allocated > limit,
  };
}

function summarizeLicenseCapacity({ organization, capacity }) {
  const entitlements = resolveLicenseEntitlements(organization);
  return {
    serviceModel: entitlements.serviceModel,
    tier: entitlements.tier,
    planLabel: entitlements.label,
    administrators: dimensionSummary(
      entitlements.adminLimit,
      Number(capacity?.activeAdministrators || 0),
      Number(capacity?.pendingAdministrators || 0)
    ),
    users: dimensionSummary(
      entitlements.userLimit,
      Number(capacity?.activeUsers || 0),
      Number(capacity?.pendingUsers || 0)
    ),
    properties: dimensionSummary(
      entitlements.propertyLimit,
      Number(capacity?.properties || 0)
    ),
  };
}

function capacityLimitError(dimension, summary, requested = 1) {
  const definition = CAPACITY_DIMENSIONS[dimension];
  if (!definition) throw new Error(`Unsupported capacity dimension: ${dimension}`);
  const detail = summary?.[dimension] || {};
  const error = new Error(
    `This organization does not have enough licensed ${definition.label} for this operation.`
  );
  error.status = 409;
  error.code = definition.code;
  error.dimension = dimension;
  error.requested = requested;
  error.capacity = summary;
  error.remaining = detail.remaining;
  return error;
}

function assertLicenseCapacity({ summary, dimension, additional = 1 }) {
  const requested = Number(additional || 0);
  if (!Number.isInteger(requested) || requested < 0) {
    throw new Error("Additional licensed capacity must be a non-negative whole number.");
  }
  const detail = summary?.[dimension];
  if (!detail) throw new Error(`Unsupported capacity dimension: ${dimension}`);
  if (!detail.unmetered && requested > detail.remaining) {
    throw capacityLimitError(dimension, summary, requested);
  }
  return summary;
}

function touchCapacityVersion(organization, { actorUserId = null, now = new Date() } = {}) {
  if (!organization.license) organization.license = {};
  organization.license.capacityVersion = Number(organization.license.capacityVersion || 0) + 1;
  organization.license.updatedAt = now;
  if (actorUserId) organization.license.updatedBy = actorUserId;
  return organization.license.capacityVersion;
}

async function currentLicenseCapacity({ organization, ...options }) {
  const capacity = await capacitySnapshot({ organization, ...options });
  return summarizeLicenseCapacity({ organization, capacity });
}

module.exports = {
  CAPACITY_DIMENSIONS,
  ORGANIZATION_ACCOUNT_SCOPE,
  INVITATION_ACCOUNT_SCOPE,
  assertLicenseCapacity,
  capacityLimitError,
  capacitySnapshot,
  currentLicenseCapacity,
  dimensionSummary,
  summarizeLicenseCapacity,
  touchCapacityVersion,
  withSession,
};
