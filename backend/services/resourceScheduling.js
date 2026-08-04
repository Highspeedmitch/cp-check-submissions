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
  const isAfterlightResource = ["afterlight_staff", "afterlight_contractor"]
    .includes(fulfillment.source);
  if (!isAfterlightResource) {
    const assignedUser = await UserModel.findOne({
      _id: userId,
      organizationId,
      accountScope: { $ne: "afterlight_resource" },
      accountStatus: { $ne: "inactive" },
      organizationArchivedAt: null,
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
    archivedAt: null,
  }).lean();
  if (!resource) {
    throw validationError("Select an active and available Afterlight resource.");
  }
  const resourceType = resource.resourceType || "contractor";
  if (fulfillment.source === "afterlight_contractor" && resourceType !== "contractor") {
    throw validationError("Select a contractor resource for Afterlight contractor fulfillment.");
  }
  if (fulfillment.source === "afterlight_staff" && resourceType === "contractor") {
    throw validationError("Select an Afterlight employee or owner for Afterlight staff fulfillment.");
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
    throw validationError("That Afterlight resource is not deployed to this property for the selected date.");
  }
  if (fulfillment.source === "afterlight_staff") {
    return {
      userId: resource.userId,
      resourceProfileId: resource._id,
      resourceDeploymentId: deployment._id,
      compensationSnapshot: undefined,
    };
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
    archivedAt: null,
  }).select("_id userId email displayName resourceType").lean();
  const deploymentsByResource = new Map(
    deployments.map((deployment) => [String(deployment.resourceProfileId), deployment])
  );
  return profiles.map((profile) => {
    const deployment = deploymentsByResource.get(String(profile._id));
    const resourceType = profile.resourceType || "contractor";
    return {
      _id: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      role: resourceType === "contractor" ? "contractor" : "user",
      accountScope: "afterlight_resource",
      resourceType,
      resourceProfileId: profile._id,
      resourceDeploymentId: deployment._id,
      propertyIds: deployment.propertyIds || [],
    };
  });
}

module.exports = { resolveAssignmentAssignee, deployedSchedulerResources };
