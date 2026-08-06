require("dotenv").config();
const mongoose = require("mongoose");
const Assignment = require("../models/assignment");
const BidRequest = require("../models/bidRequest");
const InspectionJob = require("../models/inspectionJob");
const Invoice = require("../models/invoice");
const Organization = require("../models/organization");
const OrganizationInvitation = require("../models/organizationInvitation");
const PlatformAudit = require("../models/platformAudit");
const RefreshSession = require("../models/refreshSession");
const ResourceDeployment = require("../models/resourceDeployment");
const User = require("../models/user");
const UserAudit = require("../models/userAudit");
const manifest = require("../config/productionOrganizationLicenses");
const { caseInsensitiveExact } = require("../services/organizationProvisioning");
const {
  retireProductionHistoricalOrganizationAccess,
} = require("../services/productionHistoricalOrganizationRetirement");

const DEFAULT_PLATFORM_ADMIN_EMAIL = "mitch@afterlightinspections.com";
const APPLY_CONFIRMATION = "I_UNDERSTAND_THIS_RETIRES_PRODUCTION_ORGANIZATION_ACCESS";

function parseArguments(args = []) {
  const unsupported = args.filter((argument) => argument !== "--apply");
  if (unsupported.length) throw new Error(`Unsupported arguments: ${unsupported.join(", ")}.`);
  return { apply: args.includes("--apply") };
}

function requireProductionApplyApproval({ apply, env = process.env }) {
  if (!apply) return;
  if (env.NODE_ENV !== "production") {
    throw new Error("Historical organization access retirement requires NODE_ENV=production.");
  }
  if (env.CONFIRM_PRODUCTION_HISTORICAL_RETIREMENT !== APPLY_CONFIRMATION) {
    throw new Error(
      `Set CONFIRM_PRODUCTION_HISTORICAL_RETIREMENT=${APPLY_CONFIRMATION} to apply changes.`
    );
  }
  if (env.PRODUCTION_HISTORICAL_RETIREMENT_VERSION !== manifest.historicalAccessRetirementVersion) {
    throw new Error(
      `Set PRODUCTION_HISTORICAL_RETIREMENT_VERSION=${manifest.historicalAccessRetirementVersion} to apply this reviewed retirement plan.`
    );
  }
}

function blockerSummary(blockers = {}) {
  return Object.entries(blockers)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}=${count}`)
    .join(", ");
}

function summarizePlan(plan) {
  if (plan.status === "missing") return `${plan.name}: BLOCKED - organization is missing`;
  if (plan.status === "blocked") {
    return `${plan.name}: BLOCKED - ${blockerSummary(plan.blockers)}`;
  }
  if (plan.status === "already_retired") {
    return `${plan.name}: already retired - ${plan.propertyCount} properties and historical records retained`;
  }
  const membershipLabel = plan.members.length === 1 ? "membership" : "memberships";
  return [
    `${plan.name}: ready to retire ${plan.members.length} organization ${membershipLabel}`,
    `  past-due scheduled assignments to cancel: ${plan.staleScheduledAssignments || 0}`,
    `  retained properties: ${plan.propertyCount}`,
    ...plan.members.map((member) => (
      `  ${member.email} | ${member.role} | ${member.accountScope} | ${member.accountStatus}`
    )),
  ].join("\n");
}

async function main({ args = process.argv.slice(2), env = process.env } = {}) {
  const { apply } = parseArguments(args);
  requireProductionApplyApproval({ apply, env });
  if (!env.MONGO_URI) throw new Error("MONGO_URI is required at runtime.");

  await mongoose.connect(env.MONGO_URI);
  const adminEmail = String(
    env.PRODUCTION_PLATFORM_ADMIN_EMAIL || DEFAULT_PLATFORM_ADMIN_EMAIL
  ).trim().toLowerCase();
  const actor = await User.findOne({
    email: caseInsensitiveExact(adminEmail),
    platformRole: "platform_admin",
    accountStatus: "active",
    organizationArchivedAt: null,
  });
  if (!actor) {
    throw new Error(`Active production platform administrator not found for ${adminEmail}.`);
  }

  const plans = await retireProductionHistoricalOrganizationAccess({
    configurations: manifest.organizations,
    retirementVersion: manifest.historicalAccessRetirementVersion,
    actorUserId: actor._id,
    apply,
    OrganizationModel: Organization,
    AssignmentModel: Assignment,
    InspectionJobModel: InspectionJob,
    InvitationModel: OrganizationInvitation,
    ResourceDeploymentModel: ResourceDeployment,
    BidRequestModel: BidRequest,
    InvoiceModel: Invoice,
    UserModel: User,
    RefreshSessionModel: RefreshSession,
    UserAuditModel: UserAudit,
    PlatformAuditModel: PlatformAudit,
  });
  for (const plan of plans) console.log(summarizePlan(plan));
  console.log(apply
    ? `Historical organization access retirement ${manifest.historicalAccessRetirementVersion} applied.`
    : `Dry run only for ${manifest.historicalAccessRetirementVersion}. No data was changed.`);
  return plans;
}

if (require.main === module) {
  main()
    .catch((error) => {
      if (error.plans) {
        for (const plan of error.plans) console.error(summarizePlan(plan));
      }
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => mongoose.disconnect());
}

module.exports = {
  APPLY_CONFIRMATION,
  DEFAULT_PLATFORM_ADMIN_EMAIL,
  parseArguments,
  requireProductionApplyApproval,
  blockerSummary,
  summarizePlan,
  main,
};
