require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/user");
const RefreshSession = require("../models/refreshSession");
const { ensureWorkforceOrganization } = require("../services/workforceOrganization");

const EXPECTED_EMAIL = "dev@afterlightinspections.com";

function requireExplicitDevApproval(env = process.env) {
  if (String(env.ALLOW_DEV_PLATFORM_ADMIN_PROVISIONING || "").toLowerCase() !== "true") {
    throw new Error("Set ALLOW_DEV_PLATFORM_ADMIN_PROVISIONING=true for this one-time DEV operation.");
  }
}

async function provisionDevPlatformAdmin({
  email = EXPECTED_EMAIL,
  UserModel = User,
  RefreshSessionModel = RefreshSession,
  ensureOrganization = ensureWorkforceOrganization,
} = {}) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (normalizedEmail !== EXPECTED_EMAIL) {
    throw new Error(`This DEV provisioner is restricted to ${EXPECTED_EMAIL}.`);
  }

  const existing = await UserModel.findOne({ email: normalizedEmail });
  if (existing) {
    existing.platformRole = "platform_admin";
    existing.tokenVersion = (existing.tokenVersion || 0) + 1;
    await existing.save();
    await RefreshSessionModel.updateMany(
      { userId: existing._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    return { user: existing, created: false };
  }

  const organization = await ensureOrganization();
  const discardedBootstrapPassword = crypto.randomBytes(48).toString("base64url");
  const password = await bcrypt.hash(discardedBootstrapPassword, 12);
  const user = await UserModel.create({
    username: "Afterlight DEV Platform Admin",
    email: normalizedEmail,
    password,
    organizationId: organization._id,
    accountScope: "organization",
    role: "admin",
    platformRole: "platform_admin",
    accountStatus: "active",
  });
  return { user, created: true };
}

async function main() {
  requireExplicitDevApproval();
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required at runtime.");
  await mongoose.connect(process.env.MONGO_URI);
  const result = await provisionDevPlatformAdmin();
  console.log(
    `${result.created ? "Created" : "Updated"} ${EXPECTED_EMAIL} as the DEV platform administrator.`
  );
  console.log("Use the normal Forgot password flow to establish or replace the sign-in password.");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = {
  EXPECTED_EMAIL,
  provisionDevPlatformAdmin,
  requireExplicitDevApproval,
};
