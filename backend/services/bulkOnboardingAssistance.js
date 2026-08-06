const Organization = require("../models/organization");
const PlatformAudit = require("../models/platformAudit");
const { currentLicenseCapacity } = require("./licenseCapacity");
const { notifyPlatformAdministrators } = require("./notifications");
const { bulkOnboardingAssistanceRequested } = require("./notificationEvents");

const REQUEST_ACTION = "organization_bulk_onboarding_assistance_requested";
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function inputError(message, code = "INVALID_BULK_ONBOARDING_ASSISTANCE_REQUEST") {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

function normalizeAssistanceRequest(input = {}) {
  const type = String(input.type || "").trim().toLowerCase();
  const reason = String(input.reason || "").trim();
  const estimatedRows = input.estimatedRows === "" || input.estimatedRows == null
    ? null
    : Number(input.estimatedRows);
  if (!["users", "properties"].includes(type)) {
    throw inputError("Choose users or properties for this request.");
  }
  if (reason.length < 10 || reason.length > 2000) {
    throw inputError("Describe the onboarding assistance needed in 10 to 2,000 characters.");
  }
  if (estimatedRows !== null && (!Number.isInteger(estimatedRows) || estimatedRows < 1 || estimatedRows > 10000)) {
    throw inputError("Estimated records must be a whole number from 1 to 10,000.");
  }
  return { type, reason, estimatedRows };
}

async function requestBulkOnboardingAssistance({
  organizationId,
  actorUserId,
  input,
  ipAddress = "",
  userAgent = "",
  now = new Date(),
  OrganizationModel = Organization,
  AuditModel = PlatformAudit,
  capacityForOrganization = currentLicenseCapacity,
  notifyPlatform = notifyPlatformAdministrators,
} = {}) {
  const details = normalizeAssistanceRequest(input);
  const duplicateWindowStart = new Date(now.getTime() - DUPLICATE_WINDOW_MS);
  const [organization, recentRequest] = await Promise.all([
    OrganizationModel.findById(organizationId),
    AuditModel.findOne({
      action: REQUEST_ACTION,
      targetOrganizationId: organizationId,
      "metadata.type": details.type,
      createdAt: { $gte: duplicateWindowStart },
    }).select("_id createdAt").lean(),
  ]);
  if (!organization) {
    const error = new Error("Organization not found.");
    error.status = 404;
    throw error;
  }
  if (recentRequest) {
    const error = new Error(
      `A ${details.type} onboarding assistance request was already submitted in the last 24 hours.`
    );
    error.status = 409;
    error.code = "BULK_ONBOARDING_ASSISTANCE_REQUEST_EXISTS";
    throw error;
  }

  const capacity = await capacityForOrganization({ organization });
  const dimension = capacity[details.type];
  const request = await AuditModel.create({
    actorUserId,
    action: REQUEST_ACTION,
    targetOrganizationId: organization._id,
    metadata: {
      ...details,
      capacity: {
        serviceModel: capacity.serviceModel,
        tier: capacity.tier,
        allocated: dimension.allocated,
        limit: dimension.limit,
        remaining: dimension.remaining,
        unmetered: dimension.unmetered,
      },
    },
    ipAddress,
    userAgent,
  });

  let platformNotified = true;
  try {
    await notifyPlatform({
      event: bulkOnboardingAssistanceRequested(request, organization.name, details),
      contextOrganizationId: organization._id,
    });
  } catch (notificationError) {
    platformNotified = false;
    console.error("Bulk onboarding assistance notification error:", notificationError.message);
  }

  return {
    requestId: request._id,
    platformNotified,
    capacity: dimension,
    message: platformNotified
      ? "Onboarding assistance requested. Afterlight platform administration was notified."
      : "Onboarding assistance requested and recorded for platform review.",
  };
}

module.exports = {
  DUPLICATE_WINDOW_MS,
  REQUEST_ACTION,
  normalizeAssistanceRequest,
  requestBulkOnboardingAssistance,
};
