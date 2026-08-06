require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/organization");
const User = require("../models/user");
const OrganizationInvitation = require("../models/organizationInvitation");
const ResourceDeployment = require("../models/resourceDeployment");
const PlatformAudit = require("../models/platformAudit");
const manifest = require("../config/productionOrganizationLicenses");
const { caseInsensitiveExact } = require("../services/organizationProvisioning");
const {
  configureProductionOrganizationLicenses,
} = require("../services/productionLicenseConfiguration");

const DEFAULT_PLATFORM_ADMIN_EMAIL = "mitch@afterlightinspections.com";
const APPLY_CONFIRMATION = "I_UNDERSTAND_THIS_CHANGES_PRODUCTION_LICENSES";

function parseArguments(args = []) {
  const unsupported = args.filter((argument) => argument !== "--apply");
  if (unsupported.length) throw new Error(`Unsupported arguments: ${unsupported.join(", ")}.`);
  return { apply: args.includes("--apply") };
}

function requireProductionApplyApproval({ apply, env = process.env }) {
  if (!apply) return;
  if (env.NODE_ENV !== "production") {
    throw new Error("Production license changes require NODE_ENV=production.");
  }
  if (env.CONFIRM_PRODUCTION_LICENSE_CONFIGURATION !== APPLY_CONFIRMATION) {
    throw new Error(
      `Set CONFIRM_PRODUCTION_LICENSE_CONFIGURATION=${APPLY_CONFIRMATION} to apply changes.`
    );
  }
  if (env.PRODUCTION_LICENSE_CONFIGURATION_VERSION !== manifest.version) {
    throw new Error(
      `Set PRODUCTION_LICENSE_CONFIGURATION_VERSION=${manifest.version} to apply this reviewed manifest.`
    );
  }
}

function limitsLabel(license = {}) {
  if (license.adminLimit === null) return "Managed Service, unmetered";
  return `${license.tier}, ${license.adminLimit} admins, ${license.userLimit} users, ${license.propertyLimit} properties`;
}

function capacityLabel(capacity = {}) {
  return [
    `${capacity.allocatedAdministrators || 0} admins`,
    `${capacity.allocatedUsers || 0} users`,
    `${capacity.properties || 0} properties`,
    `${capacity.activeResourceDeployments || 0} active resource deployments`,
  ].join(", ");
}

function summarizePlan(plan) {
  if (plan.status === "missing") return `${plan.name}: BLOCKED - organization is missing`;
  if (plan.status === "unmapped") return `${plan.name}: BLOCKED - customer organization is not in the manifest (${capacityLabel(plan.capacity)})`;
  if (plan.status === "service_model_mismatch") {
    return `${plan.name}: BLOCKED - service model is ${plan.serviceModel}, expected ${plan.expectedServiceModel}`;
  }
  if (plan.status === "over_capacity") {
    return `${plan.name}: BLOCKED - current capacity exceeds ${limitsLabel(plan.next)} (${capacityLabel(plan.capacity)})`;
  }
  if (plan.status === "historical_not_ready") {
    return [
      `${plan.name}: BLOCKED - historical retention requires live access to be retired`,
      `  active organization users: ${plan.blockers.activeOrganizationUsers}`,
      `  pending invitations: ${plan.blockers.pendingInvitations}`,
      `  active resource deployments: ${plan.blockers.activeResourceDeployments}`,
      `  retained properties: ${plan.capacity.properties}`,
    ].join("\n");
  }
  if (plan.status === "historical_retained") {
    return `${plan.name}: retained as historical - no live access or active deployments (${plan.capacity.properties} properties retained)`;
  }
  if (plan.status === "no_change") {
    return `${plan.name}: no change - ${limitsLabel(plan.next)} (${capacityLabel(plan.capacity)})`;
  }
  return [
    `${plan.name}: configure ${limitsLabel(plan.next)}`,
    `  previous: ${plan.hadStoredLicense ? limitsLabel(plan.previous) : "not configured"}`,
    `  current allocation: ${capacityLabel(plan.capacity)}`,
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

  const plans = await configureProductionOrganizationLicenses({
    configurations: manifest.organizations,
    configurationVersion: manifest.version,
    actorUserId: actor._id,
    apply,
    OrganizationModel: Organization,
    UserModel: User,
    InvitationModel: OrganizationInvitation,
    ResourceDeploymentModel: ResourceDeployment,
    PlatformAuditModel: PlatformAudit,
  });
  for (const plan of plans) console.log(summarizePlan(plan));
  console.log(apply
    ? `Production license configuration ${manifest.version} applied.`
    : `Dry run only for ${manifest.version}. No data was changed.`);
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
  limitsLabel,
  capacityLabel,
  summarizePlan,
  main,
};
