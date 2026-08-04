require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/organization");
const User = require("../models/user");
const FulfillmentAudit = require("../models/fulfillmentAudit");
const PlatformAudit = require("../models/platformAudit");
const configurations = require("../config/productionOrganizations");
const { caseInsensitiveExact } = require("../services/organizationProvisioning");
const {
  configureProductionOrganizations,
} = require("../services/productionOrganizationConfiguration");

const DEFAULT_PLATFORM_ADMIN_EMAIL = "mitch@afterlightinspections.com";
const APPLY_CONFIRMATION = "I_UNDERSTAND_THIS_CHANGES_PRODUCTION";

function parseArguments(args = []) {
  const unsupported = args.filter((arg) => arg !== "--apply");
  if (unsupported.length) throw new Error(`Unsupported arguments: ${unsupported.join(", ")}.`);
  return { apply: args.includes("--apply") };
}

function requireProductionApplyApproval({ apply, env = process.env }) {
  if (!apply) return;
  if (env.NODE_ENV !== "production") {
    throw new Error("Production organization changes require NODE_ENV=production.");
  }
  if (env.CONFIRM_PRODUCTION_ORGANIZATION_CONFIGURATION !== APPLY_CONFIRMATION) {
    throw new Error(
      `Set CONFIRM_PRODUCTION_ORGANIZATION_CONFIGURATION=${APPLY_CONFIRMATION} to apply changes.`
    );
  }
}

function summarizePlan(plan) {
  if (plan.status === "missing") return `${plan.name}: MISSING`;
  if (plan.status === "no_change") return `${plan.name}: no change`;
  return [
    `${plan.name}: update`,
    `  service model: ${plan.previous.serviceModel} -> ${plan.next.serviceModel}`,
    `  default fulfillment: ${plan.previous.defaultFulfillmentSource} -> ${plan.next.defaultFulfillmentSource}`,
    `  policy version: ${plan.previous.policyVersion} -> ${plan.next.policyVersion}`,
    `  property overrides cleared: ${plan.clearedPropertyOverrides}`,
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

  const plans = await configureProductionOrganizations({
    configurations,
    actorUserId: actor._id,
    apply,
    OrganizationModel: Organization,
    FulfillmentAuditModel: FulfillmentAudit,
    PlatformAuditModel: PlatformAudit,
  });
  for (const plan of plans) console.log(summarizePlan(plan));
  console.log(apply ? "Production organization configuration applied." : "Dry run only. No data was changed.");
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
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = {
  APPLY_CONFIRMATION,
  DEFAULT_PLATFORM_ADMIN_EMAIL,
  parseArguments,
  requireProductionApplyApproval,
  summarizePlan,
  main,
};
