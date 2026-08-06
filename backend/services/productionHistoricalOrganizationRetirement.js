const mongoose = require("mongoose");
const {
  normalizedNameKey,
  normalizeProductionLicenseConfiguration,
} = require("./productionLicenseConfiguration");

const HISTORICAL_ARCHIVE_REASON = "Historical Production test organization";

async function resolveQuery(query, session) {
  const scoped = session && query && typeof query.session === "function"
    ? query.session(session)
    : query;
  return scoped;
}

async function findMembers(UserModel, organizationId, session) {
  let query = UserModel.find({
    organizationId,
    organizationArchivedAt: null,
  });
  if (query && typeof query.select === "function") {
    query = query.select("_id email role accountScope accountStatus tokenVersion organizationArchivedAt");
  }
  return resolveQuery(query, session);
}

async function buildOrganizationRetirementPlan({
  organization,
  AssignmentModel,
  InspectionJobModel,
  InvitationModel,
  ResourceDeploymentModel,
  BidRequestModel,
  InvoiceModel,
  UserModel,
  now,
  session,
}) {
  const [
    members,
    scheduledAssignments,
    activeInspectionJobs,
    pendingInvitations,
    activeResourceDeployments,
    pendingBidRequests,
    pendingInvoices,
  ] = await Promise.all([
    findMembers(UserModel, organization._id, session),
    resolveQuery(AssignmentModel.countDocuments({
      organizationId: organization._id,
      status: "scheduled",
    }), session),
    resolveQuery(InspectionJobModel.countDocuments({
      organizationId: organization._id,
      status: { $in: ["uploading", "queued", "processing"] },
    }), session),
    resolveQuery(InvitationModel.countDocuments({
      organizationId: organization._id,
      status: { $in: ["pending", "accepting"] },
      expiresAt: { $gt: now },
    }), session),
    resolveQuery(ResourceDeploymentModel.countDocuments({
      organizationId: organization._id,
      status: { $in: ["active", "paused"] },
    }), session),
    resolveQuery(BidRequestModel.countDocuments({
      organizationId: organization._id,
      status: "pending",
      archivedAt: null,
    }), session),
    resolveQuery(InvoiceModel.countDocuments({
      organizationId: organization._id,
      status: { $in: ["pending_review", "approving", "failed"] },
      archivedAt: null,
    }), session),
  ]);

  const blockers = {
    scheduledAssignments,
    activeInspectionJobs,
    pendingInvitations,
    activeResourceDeployments,
    pendingBidRequests,
    pendingInvoices,
  };
  const blocked = Object.values(blockers).some((count) => count > 0);
  return {
    name: organization.name,
    organizationId: organization._id,
    status: blocked
      ? "blocked"
      : members.length
        ? "ready"
        : "already_retired",
    propertyCount: Array.isArray(organization.properties) ? organization.properties.length : 0,
    members: members.map((member) => ({
      userId: member._id,
      email: member.email,
      role: member.role,
      accountScope: member.accountScope || "organization",
      accountStatus: member.accountStatus || "active",
      tokenVersion: Number(member.tokenVersion || 0),
    })),
    blockers,
  };
}

function historicalConfigurations(configurations) {
  const historical = configurations
    .map(normalizeProductionLicenseConfiguration)
    .filter((configuration) => configuration.disposition === "historical");
  const seen = new Set();
  for (const configuration of historical) {
    const key = normalizedNameKey(configuration.name);
    if (seen.has(key)) {
      throw new Error(`Duplicate historical organization configuration for ${configuration.name}.`);
    }
    seen.add(key);
  }
  if (!historical.length) throw new Error("No historical Production organizations are configured.");
  return historical;
}

async function buildHistoricalRetirementPlans({
  configurations,
  OrganizationModel,
  AssignmentModel,
  InspectionJobModel,
  InvitationModel,
  ResourceDeploymentModel,
  BidRequestModel,
  InvoiceModel,
  UserModel,
  now = new Date(),
  session = null,
}) {
  const configured = historicalConfigurations(configurations);
  const organizations = await resolveQuery(OrganizationModel.find({
    workspaceType: { $ne: "afterlight_workforce" },
  }), session);
  const byName = new Map();
  for (const organization of organizations) {
    const key = normalizedNameKey(organization.name);
    if (byName.has(key)) {
      throw new Error(`Production contains duplicate customer organization names matching ${organization.name}.`);
    }
    byName.set(key, organization);
  }

  const plans = [];
  for (const configuration of configured) {
    const organization = byName.get(normalizedNameKey(configuration.name));
    if (!organization) {
      plans.push({ name: configuration.name, status: "missing" });
      continue;
    }
    plans.push(await buildOrganizationRetirementPlan({
      organization,
      AssignmentModel,
      InspectionJobModel,
      InvitationModel,
      ResourceDeploymentModel,
      BidRequestModel,
      InvoiceModel,
      UserModel,
      now,
      session,
    }));
  }
  return { plans, organizationsByName: byName };
}

function assertRetirementPlansReady(plans) {
  const blocked = plans.filter((plan) => !["ready", "already_retired"].includes(plan.status));
  if (!blocked.length) return;
  const error = new Error(`Historical organization access retirement blocked: ${blocked.map((plan) => `${plan.name} (${plan.status})`).join(", ")}.`);
  error.code = "PRODUCTION_HISTORICAL_RETIREMENT_BLOCKED";
  error.plans = plans;
  throw error;
}

async function defaultTransactionRunner(operation) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function createMany(Model, records, session) {
  if (!records.length) return [];
  if (session) return Model.create(records, { session });
  return Model.create(records);
}

async function retireProductionHistoricalOrganizationAccess({
  configurations,
  retirementVersion,
  actorUserId,
  apply = false,
  OrganizationModel,
  AssignmentModel,
  InspectionJobModel,
  InvitationModel,
  ResourceDeploymentModel,
  BidRequestModel,
  InvoiceModel,
  UserModel,
  RefreshSessionModel,
  UserAuditModel,
  PlatformAuditModel,
  now = () => new Date(),
  transactionRunner = defaultTransactionRunner,
}) {
  const dependencies = {
    configurations,
    OrganizationModel,
    AssignmentModel,
    InspectionJobModel,
    InvitationModel,
    ResourceDeploymentModel,
    BidRequestModel,
    InvoiceModel,
    UserModel,
  };
  const preview = await buildHistoricalRetirementPlans({ ...dependencies, now: now() });
  assertRetirementPlansReady(preview.plans);
  if (!apply) return preview.plans;

  return transactionRunner(async (session) => {
    const current = await buildHistoricalRetirementPlans({
      ...dependencies,
      now: now(),
      session,
    });
    assertRetirementPlansReady(current.plans);
    const retiredAt = now();

    for (const plan of current.plans) {
      if (plan.status !== "ready") continue;
      const memberById = new Map(plan.members.map((member) => [String(member.userId), member]));
      const organization = current.organizationsByName.get(normalizedNameKey(plan.name));
      const members = await findMembers(UserModel, organization._id, session);
      const userAudits = [];

      for (const member of members) {
        const snapshot = memberById.get(String(member._id));
        if (!snapshot) {
          const error = new Error(`Organization membership changed during retirement for ${plan.name}.`);
          error.code = "PRODUCTION_HISTORICAL_RETIREMENT_RACE";
          throw error;
        }
        member.organizationArchivedAt = retiredAt;
        member.organizationArchivedBy = actorUserId;
        member.organizationArchiveReason = HISTORICAL_ARCHIVE_REASON;
        member.tokenVersion = Number(member.tokenVersion || 0) + 1;
        await member.save(session ? { session } : undefined);
        await RefreshSessionModel.updateMany(
          { userId: member._id, revokedAt: null },
          { $set: { revokedAt: retiredAt } },
          session ? { session } : undefined
        );
        userAudits.push({
          organizationId: organization._id,
          targetUserId: member._id,
          changedBy: actorUserId,
          action: "user_archived",
          changes: {
            reason: HISTORICAL_ARCHIVE_REASON,
            role: snapshot.role,
            accountScope: snapshot.accountScope,
            accountStatus: snapshot.accountStatus,
            preservedPropertyAssignments: true,
            archivedAt: retiredAt,
          },
        });
      }

      await createMany(UserAuditModel, userAudits, session);
      await createMany(PlatformAuditModel, [{
        actorUserId,
        action: "production_historical_organization_access_retired",
        targetOrganizationId: organization._id,
        metadata: {
          retirementVersion,
          name: organization.name,
          reason: HISTORICAL_ARCHIVE_REASON,
          retiredAt,
          retiredMembershipCount: members.length,
          retainedPropertyCount: plan.propertyCount,
          members: plan.members.map((member) => ({
            userId: member.userId,
            role: member.role,
            accountScope: member.accountScope,
          })),
          preservedHistoricalData: true,
        },
      }], session);
    }
    return current.plans;
  });
}

module.exports = {
  HISTORICAL_ARCHIVE_REASON,
  findMembers,
  buildOrganizationRetirementPlan,
  historicalConfigurations,
  buildHistoricalRetirementPlans,
  assertRetirementPlansReady,
  defaultTransactionRunner,
  retireProductionHistoricalOrganizationAccess,
};
