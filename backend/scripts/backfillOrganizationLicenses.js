require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/organization");
const { backfillOrganizationLicenses } = require("../services/licenseBackfill");

function parseArguments(args = []) {
  const unsupported = args.filter((argument) => argument !== "--apply");
  if (unsupported.length) throw new Error(`Unsupported arguments: ${unsupported.join(", ")}.`);
  return { apply: args.includes("--apply") };
}

function summarize(plan) {
  if (!plan.changed) return `${plan.name}: no change`;
  const format = (license) => license.adminLimit === null
    ? "managed/unmetered"
    : `${license.tier}, ${license.adminLimit} admins, ${license.userLimit} users, ${license.propertyLimit} properties`;
  return `${plan.name}: ${format(plan.previous)} -> ${format(plan.next)}`;
}

async function main({ args = process.argv.slice(2), env = process.env } = {}) {
  const { apply } = parseArguments(args);
  if (!env.MONGO_URI) throw new Error("MONGO_URI is required at runtime.");
  if (apply && env.NODE_ENV === "production") {
    throw new Error("This DEV backfill script cannot apply changes in production.");
  }
  await mongoose.connect(env.MONGO_URI);
  const plans = await backfillOrganizationLicenses({ OrganizationModel: Organization, apply });
  for (const plan of plans) console.log(summarize(plan));
  console.log(apply ? "DEV organization licenses backfilled." : "Dry run only. No data was changed.");
  return plans;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => mongoose.disconnect());
}

module.exports = { parseArguments, summarize, main };
