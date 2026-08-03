const mongoose = require("mongoose");
const Organization = require("../models/organization");
const ResourceProfile = require("../models/resourceProfile");
const ResourceDeployment = require("../models/resourceDeployment");
const PlatformAudit = require("../models/platformAudit");

function operationError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanIds(value, limit = 500) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item).trim())
      .filter(Boolean)
  )].slice(0, limit);
}

function validCents(value, { optional = false } = {}) {
  if (optional && (value === null || value === "" || value === undefined)) return null;
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0) {
    throw operationError("Rates must be entered as a non-negative number of cents.", 400);
  }
  return cents;
}

async function withSession(query, session) {
  return query?.session ? query.session(session) : query;
}

async function updateResourceDeploymentScope({
  deploymentId,
  organizationId,
  propertyIds,
  rateOverrideCents,
  actorUserId,
  audit = {},
  OrganizationModel = Organization,
  ResourceProfileModel = ResourceProfile,
  ResourceDeploymentModel = ResourceDeployment,
  PlatformAuditModel = PlatformAudit,
  startSession = () => mongoose.startSession(),
}) {
  if (!organizationId) throw operationError("Select an eligible managed or hybrid organization.", 400);
  const requestedIds = cleanIds(propertyIds);
  const requestedRateOverride = validCents(rateOverrideCents, { optional: true });
  const session = await startSession();
  let updatedDeployment;
  let organizationChanged = false;

  try {
    await session.withTransaction(async () => {
      const deployment = await withSession(
        ResourceDeploymentModel.findById(deploymentId),
        session
      );
      if (!deployment) throw operationError("Deployment not found.", 404);
      if (deployment.status === "ended") {
        throw operationError("Ended deployments cannot be edited. Create or reactivate a current deployment instead.", 400);
      }

      const [resource, organization] = await Promise.all([
        withSession(ResourceProfileModel.findById(deployment.resourceProfileId), session),
        withSession(OrganizationModel.findOne({
          _id: organizationId,
          workspaceType: { $ne: "afterlight_workforce" },
          serviceModel: { $in: ["managed", "hybrid"] },
        }), session),
      ]);
      if (!resource) throw operationError("Resource not found.", 404);
      if (!organization) throw operationError("Select an eligible managed or hybrid organization.", 400);

      const validPropertyIds = new Set((organization.properties || []).map((property) => String(property._id)));
      if (requestedIds.some((propertyId) => !validPropertyIds.has(propertyId))) {
        throw operationError("One or more selected properties do not belong to this organization.", 400);
      }

      const effectiveRateOverride = resource.resourceType === "contractor"
        ? requestedRateOverride
        : null;
      if (resource.resourceType === "contractor"
        && (effectiveRateOverride ?? resource.defaultRateCents) <= 0) {
        throw operationError("Configure a positive default or deployment rate.", 400);
      }

      organizationChanged = String(deployment.organizationId) !== String(organization._id);
      if (!organizationChanged) {
        deployment.propertyIds = requestedIds;
        deployment.rateOverrideCents = effectiveRateOverride;
        deployment.updatedBy = actorUserId;
        await deployment.save({ session });
        updatedDeployment = deployment;
      } else {
        let destination = await withSession(ResourceDeploymentModel.findOne({
          resourceProfileId: deployment.resourceProfileId,
          organizationId: organization._id,
        }), session);
        if (destination && destination.status !== "ended") {
          throw operationError(
            "This resource already has a current deployment in that organization. Edit that deployment instead.",
            409
          );
        }

        const movedAt = new Date();
        if (destination) {
          destination.propertyIds = requestedIds;
          destination.status = deployment.status;
          destination.rateOverrideCents = effectiveRateOverride;
          destination.startsAt = movedAt;
          destination.endsAt = null;
          destination.updatedBy = actorUserId;
          await destination.save({ session });
        } else {
          [destination] = await ResourceDeploymentModel.create([{
            resourceProfileId: deployment.resourceProfileId,
            organizationId: organization._id,
            propertyIds: requestedIds,
            status: deployment.status,
            rateOverrideCents: effectiveRateOverride,
            startsAt: movedAt,
            endsAt: null,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          }], { session });
        }

        deployment.status = "ended";
        deployment.endsAt = movedAt;
        deployment.updatedBy = actorUserId;
        await deployment.save({ session });
        updatedDeployment = destination;
      }

      await PlatformAuditModel.create([{
        ...audit,
        actorUserId,
        action: "afterlight_resource_deployment_scope_updated",
        targetOrganizationId: organization._id,
        metadata: {
          resourceProfileId: deployment.resourceProfileId,
          sourceDeploymentId: deployment._id,
          destinationDeploymentId: updatedDeployment._id,
          previousOrganizationId: deployment.organizationId,
          organizationId: organization._id,
          organizationChanged,
          propertyIds: requestedIds,
        },
      }], { session });
    });
    return { deployment: updatedDeployment, organizationChanged };
  } finally {
    await session.endSession();
  }
}

module.exports = {
  cleanIds,
  updateResourceDeploymentScope,
  validCents,
};
