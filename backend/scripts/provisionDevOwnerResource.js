require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/user");
const ResourceProfile = require("../models/resourceProfile");
const RefreshSession = require("../models/refreshSession");

const EXPECTED_OWNER_EMAIL = "skylinemitch@outlook.com";

function requireExplicitDevOwnerApproval(env = process.env) {
  if (String(env.ALLOW_DEV_OWNER_PROVISIONING || "").toLowerCase() !== "true") {
    throw new Error("Set ALLOW_DEV_OWNER_PROVISIONING=true for this one-time DEV operation.");
  }
}

async function provisionDevOwnerResource({
  email = EXPECTED_OWNER_EMAIL,
  UserModel = User,
  ResourceProfileModel = ResourceProfile,
  RefreshSessionModel = RefreshSession,
} = {}) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (normalizedEmail !== EXPECTED_OWNER_EMAIL) {
    throw new Error(`This DEV provisioner is restricted to ${EXPECTED_OWNER_EMAIL}.`);
  }
  const user = await UserModel.findOne({
    email: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  });
  if (!user) {
    throw new Error(`Create or invite ${EXPECTED_OWNER_EMAIL} before provisioning owner access.`);
  }

  let profile = await ResourceProfileModel.findOne({ email: normalizedEmail });
  const created = !profile;
  if (profile?.userId && String(profile.userId) !== String(user._id)) {
    throw new Error("That resource profile is linked to a different Afterlight identity.");
  }
  if (!profile) {
    profile = await ResourceProfileModel.create({
      userId: user._id,
      email: normalizedEmail,
      displayName: user.username || "Afterlight Owner",
      resourceType: "owner",
      status: "active",
      availabilityStatus: "available",
      defaultRateCents: 0,
      createdBy: user._id,
      updatedBy: user._id,
    });
  } else {
    profile.userId = user._id;
    profile.resourceType = "owner";
    profile.status = "active";
    profile.availabilityStatus = "available";
    profile.defaultRateCents = 0;
    profile.updatedBy = user._id;
    await profile.save();
  }

  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await RefreshSessionModel.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  return { user, profile, created };
}

async function main() {
  requireExplicitDevOwnerApproval();
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required at runtime.");
  await mongoose.connect(process.env.MONGO_URI);
  const result = await provisionDevOwnerResource();
  console.log(
    `${result.created ? "Created" : "Updated"} the DEV owner resource for ${EXPECTED_OWNER_EMAIL}.`
  );
  console.log("Existing sessions were revoked. Sign in again to load the Resource Portal workspace.");
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
  EXPECTED_OWNER_EMAIL,
  provisionDevOwnerResource,
  requireExplicitDevOwnerApproval,
};
