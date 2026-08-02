const User = require("../models/user");
const ResourceProfile = require("../models/resourceProfile");
const ResourceDeployment = require("../models/resourceDeployment");

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function resolveAssignmentAssignee({
  fulfillment,
  userId,
  organizationId,
  property,
  startDate,
  UserModel = User,
  ResourceProfileModel = ResourceProfile,
  ResourceDeploymentModel = ResourceDeployment,
}) {
  if (fulfillment.source !== "afterlight_contractor") {
    const assignedUser = await UserModel.findOne({
      _id: userId,
      organizationId,
      accountScope: { $ne: "afterlight_resource" },
      accountStatus: { $ne: "inactive" },
    }).select("_id").lean();
    if (!assignedUser) {
      throw validationError("Assigned user is not active in this organization.");
    }
    return {
      userId: assignedUser._id,
      resourceProfileId: null,
      resourceDeploymentId: null,
      compensationSnapshot: undefined,
    };
  }

  const resource = await ResourceProfileModel.findOne({
    userId,
    status: "active",
    availabilityStatus: "available",
  }).lean();
  if (!resource) {
    throw validationError("Select an active and available Afterlight contractor.");
  }
  const effectiveAt = new Date(startDate);
  const deployment = await ResourceDeploymentModel.findOne({
    resourceProfileId: resource._id,
    organizationId,
    status: "active",
    startsAt: { $lte: effectiveAt },
    $and: [
      { $or: [{ endsAt: null }, { endsAt: { $gte: effectiveAt } }] },
      { $or: [{ propertyIds: { $size: 0 } }, { propertyIds: property._id }] },
    ],
  }).lean();
  if (!deployment) {
    throw validationError("That Afterlight contractor is not deployed to this property for the selected date.");
  }
  const amountCents = deployment.rateOverrideCents ?? resource.defaultRateCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw validationError("Configure a positive contractor rate before creating this assignment.");
  }
  return {
    userId: resource.userId,
    resourceProfileId: resource._id,
    resourceDeploymentId: deployment._id,
    compensationSnapshot: {
      payeeType: "afterlight_contractor",
      rateType: "per_assignment",
      amountCents,
      currency: resource.currency || "USD",
      snapshottedAt: new Date(),
    },
  };
}

async function deployedSchedulerResources({
  organizationId,
  now = new Date(),
  ResourceProfileModel = ResourceProfile,
  ResourceDeploymentModel = ResourceDeployment,
}) {
  const deployments = await ResourceDeploymentModel.find({
    organizationId,
    status: "active",
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
  }).lean();
  if (!deployments.length) return [];
  const profiles = await ResourceProfileModel.find({
    _id: { $in: deployments.map((deployment) => deployment.resourceProfileId) },
    userId: { $ne: null },
    status: "active",
    availabilityStatus: "available",
  }).select("_id userId email displayName defaultRateCents currency").lean();
  const deploymentsByResource = new Map(
    deployments.map((deployment) => [String(deployment.resourceProfileId), deployment])
  );
  return profiles.map((profile) => {
    const deployment = deploymentsByResource.get(String(profile._id));
    return {
      _id: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      role: "contractor",
      accountScope: "afterlight_resource",
      resourceProfileId: profile._id,
      resourceDeploymentId: deployment._id,
      propertyIds: deployment.propertyIds || [],
      rateCents: deployment.rateOverrideCents ?? profile.defaultRateCents,
      currency: profile.currency || "USD",
    };
  });
}

module.exports = { resolveAssignmentAssignee, deployedSchedulerResources };
