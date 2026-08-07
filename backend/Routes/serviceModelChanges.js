const express = require("express");
const mongoose = require("mongoose");
const Organization = require("../models/organization");
const User = require("../models/user");
const OrganizationInvitation = require("../models/organizationInvitation");
const ServiceModelChangeRequest = require("../models/serviceModelChangeRequest");
const PlatformAudit = require("../models/platformAudit");
const FulfillmentAudit = require("../models/fulfillmentAudit");
const ResourceDeployment = require("../models/resourceDeployment");
const InvoiceEmailAuthorization = require("../models/invoiceEmailAuthorization");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");
const {
  SERVICE_MODEL_DEFAULTS,
  organizationDefaultSource,
  validateServiceModel,
} = require("../services/fulfillmentPolicy");
const {
  deliverPlatformRequestEmail,
  deliverRequesterDecisionEmail,
} = require("../services/serviceModelChangeEmails");
const {
  notifyPlatformAdministrators,
  sendUserNotification,
} = require("../services/notifications");
const { servicePlanChangeEvent } = require("../services/notificationEvents");
const {
  LICENSE_TIERS,
  METERED_SERVICE_MODELS,
  defaultStoredLicense,
  resolveLicenseEntitlements,
} = require("../services/licenseEntitlements");
const { capacitySnapshot: licensedCapacitySnapshot } = require("../services/licenseCapacity");

const router = express.Router();
const ACTIVE_STATUSES = ["pending_review", "information_requested"];
const CHANGE_TYPES = new Set(["service_model", "license_tier", "custom_capacity"]);
const MAX_CUSTOM_ADMIN_LIMIT = 1000;

function requireOrganizationAdmin(req, res, next) {
  if (req.user?.role !== "admin" || req.user?.assumedOrganization) {
    return res.status(403).json({ error: "Organization administrator access required." });
  }
  return next();
}

function boundedText(value, label, { required = true } = {}) {
  const text = String(value || "").trim();
  if (required && !text) {
    const error = new Error(`${label} is required.`);
    error.status = 400;
    throw error;
  }
  if (text.length > 2000) {
    const error = new Error(`${label} must be 2,000 characters or fewer.`);
    error.status = 400;
    throw error;
  }
  return text;
}

function proposedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Select a valid proposed effective date.");
    error.status = 400;
    throw error;
  }
  return date;
}

function changeType(value) {
  const normalized = String(value || "service_model").trim();
  if (!CHANGE_TYPES.has(normalized)) {
    const error = new Error("Select a valid contract change type.");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function licenseTier(value, { required = false } = {}) {
  const normalized = value == null || value === "" ? null : String(value).trim();
  if (required && !normalized) {
    const error = new Error("Select a requested license tier.");
    error.status = 400;
    throw error;
  }
  if (normalized && !LICENSE_TIERS.includes(normalized)) {
    const error = new Error("Select a valid license tier.");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function customAdminLimit(value, currentLimit, { status = 400 } = {}) {
  const requestedLimit = Number(value);
  if (!Number.isInteger(requestedLimit) || requestedLimit <= Number(currentLimit || 0)) {
    const error = new Error(`Requested administrator capacity must be a whole number greater than ${currentLimit}.`);
    error.status = status;
    throw error;
  }
  if (requestedLimit > MAX_CUSTOM_ADMIN_LIMIT) {
    const error = new Error(`Requested administrator capacity cannot exceed ${MAX_CUSTOM_ADMIN_LIMIT}.`);
    error.status = status;
    throw error;
  }
  return requestedLimit;
}

function tierLabel(value) {
  return value ? `Tier ${String(value).slice(-1)}` : "Unmetered";
}

function storedLicense(organization, serviceModel, tier, updatedBy, updatedAt) {
  const previousVersion = Number(organization.license?.adminSeatVersion || 0);
  const previousCapacityVersion = Number(organization.license?.capacityVersion || 0);
  return {
    ...defaultStoredLicense(serviceModel, tier),
    adminSeatVersion: previousVersion,
    capacityVersion: previousCapacityVersion,
    updatedBy,
    updatedAt,
  };
}

async function capacitySnapshot({ organization, UserModel, InvitationModel, now }) {
  const snapshot = await licensedCapacitySnapshot({ organization, UserModel, InvitationModel, now });
  return {
    activeAdministratorCount: snapshot.activeAdministrators,
    pendingAdministratorCount: snapshot.pendingAdministrators,
    activeUserCount: snapshot.activeUsers,
    pendingUserCount: snapshot.pendingUsers,
  };
}

function auditAction(request, status) {
  const prefix = request.changeType === "license_tier"
    ? "license_tier_change"
    : request.changeType === "custom_capacity"
      ? "custom_capacity_change"
      : "service_model_change";
  return `${prefix}_${status}`;
}

function requestResult(request) {
  const value = typeof request.toObject === "function" ? request.toObject() : request;
  const populatedOrganization = value.organizationId?.name;
  const populatedRequester = value.requestedBy?.email || value.requestedBy?.username;
  return {
    _id: value._id,
    organization: populatedOrganization
      ? { _id: value.organizationId._id, name: value.organizationId.name }
      : { _id: value.organizationId, name: "Organization" },
    requestedBy: populatedRequester
      ? { _id: value.requestedBy._id, email: value.requestedBy.email, username: value.requestedBy.username }
      : { _id: value.requestedBy },
    changeType: value.changeType || "service_model",
    currentServiceModel: value.currentServiceModel,
    requestedServiceModel: value.requestedServiceModel,
    currentLicenseTier: value.currentLicenseTier || null,
    requestedLicenseTier: value.requestedLicenseTier || null,
    reason: value.reason,
    proposedEffectiveDate: value.proposedEffectiveDate,
    status: value.status,
    organizationSnapshot: value.organizationSnapshot || {},
    messages: (value.messages || []).map((message) => ({
      _id: message._id,
      actorUserId: message.actorUserId,
      actorScope: message.actorScope,
      message: message.message,
      createdAt: message.createdAt,
    })),
    platformResponse: value.platformResponse || "",
    reviewedBy: value.reviewedBy,
    reviewedAt: value.reviewedAt,
    appliedAt: value.appliedAt,
    notification: value.notification || {},
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

async function populatedRequest(query) {
  return query
    .populate("organizationId", "name serviceModel")
    .populate("requestedBy", "email username")
    .populate("messages.actorUserId", "email username")
    .populate("reviewedBy", "email username")
    .lean();
}

function auditDetails(req) {
  return {
    actorUserId: req.user.userId,
    ipAddress: req.ip || "",
    userAgent: typeof req.get === "function" ? req.get("user-agent") || "" : "",
  };
}

async function mongoTransaction(operation) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function saveDocument(document, session) {
  return session ? document.save({ session }) : document.save();
}

async function createDocument(Model, value, session) {
  if (!session) return Model.create(value);
  const [created] = await Model.create([value], { session });
  return created;
}

function updateMany(Model, query, update, session) {
  return session
    ? Model.updateMany(query, update, { session })
    : Model.updateMany(query, update);
}

function createServiceModelChangeHandlers({
  RequestModel = ServiceModelChangeRequest,
  OrganizationModel = Organization,
  UserModel = User,
  InvitationModel = OrganizationInvitation,
  PlatformAuditModel = PlatformAudit,
  FulfillmentAuditModel = FulfillmentAudit,
  ResourceDeploymentModel = ResourceDeployment,
  InvoiceEmailAuthorizationModel = InvoiceEmailAuthorization,
  sendPlatformEmail = deliverPlatformRequestEmail,
  sendRequesterEmail = deliverRequesterDecisionEmail,
  notifyPlatform = notifyPlatformAdministrators,
  notifyUser = sendUserNotification,
  now = () => new Date(),
  runServiceModelTransaction = mongoTransaction,
} = {}) {
  async function createRequest(req, res) {
    try {
      if (req.user?.role !== "admin" || req.user?.assumedOrganization) {
        return res.status(403).json({ error: "Organization administrator access required." });
      }
      const requestedChangeType = changeType(req.body.changeType);
      const reason = boundedText(req.body.reason, "Business reason");
      const [organization, requester, existing] = await Promise.all([
        OrganizationModel.findById(req.user.organizationId),
        UserModel.findById(req.user.userId).select("email username"),
        RequestModel.findOne({
          organizationId: req.user.organizationId,
          status: { $in: ACTIVE_STATUSES },
        }),
      ]);
      if (!organization || !requester) return res.status(404).json({ error: "Organization administrator not found." });
      if (existing) return res.status(409).json({ error: "This organization already has an active contract change request." });
      const currentServiceModel = organization.serviceModel || "managed";
      const currentEntitlements = resolveLicenseEntitlements(organization);
      const currentLicenseTier = currentEntitlements.tier;
      let requestedServiceModel = currentServiceModel;
      let requestedLicenseTier = currentLicenseTier;
      let requestedAdminLimit = null;

      if (requestedChangeType === "license_tier") {
        if (!METERED_SERVICE_MODELS.has(currentServiceModel)) {
          return res.status(400).json({ error: "License tier increases are available only for SaaS and Hybrid organizations." });
        }
        requestedLicenseTier = licenseTier(req.body.requestedLicenseTier, { required: true });
        if (LICENSE_TIERS.indexOf(requestedLicenseTier) <= LICENSE_TIERS.indexOf(currentLicenseTier)) {
          return res.status(400).json({ error: `Select a tier higher than the current ${tierLabel(currentLicenseTier)} plan.` });
        }
      } else if (requestedChangeType === "custom_capacity") {
        if (!METERED_SERVICE_MODELS.has(currentServiceModel) || currentLicenseTier !== "tier_3") {
          return res.status(400).json({ error: "Custom administrator capacity is available only for Tier 3 SaaS and Hybrid organizations." });
        }
        requestedAdminLimit = customAdminLimit(req.body.requestedAdminLimit, currentEntitlements.adminLimit);
      } else {
        requestedServiceModel = validateServiceModel(req.body.requestedServiceModel);
        if (requestedServiceModel === currentServiceModel) {
          return res.status(400).json({ error: "Select a service model different from the current contract." });
        }
        requestedLicenseTier = METERED_SERVICE_MODELS.has(requestedServiceModel)
          ? licenseTier(req.body.requestedLicenseTier, { required: true })
          : null;
      }

      const requestedAt = now();
      const properties = organization.properties || [];
      let requestedEntitlements = resolveLicenseEntitlements({
        serviceModel: requestedServiceModel,
        license: { tier: requestedLicenseTier },
      });
      if (requestedChangeType === "custom_capacity") {
        requestedEntitlements = {
          ...currentEntitlements,
          adminLimit: requestedAdminLimit,
        };
      } else if (requestedChangeType === "license_tier") {
        requestedEntitlements = {
          ...requestedEntitlements,
          adminLimit: Math.max(currentEntitlements.adminLimit || 0, requestedEntitlements.adminLimit || 0),
          userLimit: Math.max(currentEntitlements.userLimit || 0, requestedEntitlements.userLimit || 0),
          propertyLimit: Math.max(currentEntitlements.propertyLimit || 0, requestedEntitlements.propertyLimit || 0),
        };
      }
      const usage = await capacitySnapshot({
        organization,
        UserModel,
        InvitationModel,
        now: requestedAt,
      });
      const request = await RequestModel.create({
        organizationId: organization._id,
        requestedBy: requester._id,
        changeType: requestedChangeType,
        currentServiceModel,
        requestedServiceModel,
        currentLicenseTier,
        requestedLicenseTier,
        reason,
        proposedEffectiveDate: proposedDate(req.body.proposedEffectiveDate),
        organizationSnapshot: {
          propertyCount: properties.length,
          propertyOverrideCount: properties.filter((property) => property.fulfillmentPolicy?.defaultSource).length,
          defaultFulfillmentSource: organizationDefaultSource(organization),
          policyVersion: Number(organization.fulfillmentPolicy?.version || 1),
          currentAdminLimit: currentEntitlements.adminLimit,
          currentUserLimit: currentEntitlements.userLimit,
          currentPropertyLimit: currentEntitlements.propertyLimit,
          requestedAdminLimit: requestedEntitlements.adminLimit,
          requestedUserLimit: requestedEntitlements.userLimit,
          requestedPropertyLimit: requestedEntitlements.propertyLimit,
          currentAfterlightPortfolioMinimumPercent: currentEntitlements.afterlightPortfolioMinimumPercent,
          requestedAfterlightPortfolioMinimumPercent: requestedEntitlements.afterlightPortfolioMinimumPercent,
          ...usage,
        },
        messages: [{
          actorUserId: requester._id,
          actorScope: "organization_admin",
          message: reason,
          createdAt: requestedAt,
        }],
      });
      await PlatformAuditModel.create({
        ...auditDetails(req),
        action: auditAction(request, "requested"),
        targetOrganizationId: organization._id,
        metadata: {
          requestId: request._id,
          changeType: requestedChangeType,
          currentServiceModel,
          requestedServiceModel,
          currentLicenseTier,
          requestedLicenseTier,
          requestedAdminLimit: requestedEntitlements.adminLimit,
          proposedEffectiveDate: request.proposedEffectiveDate,
        },
      });
      let emailDelivered = true;
      try {
        await sendPlatformEmail({ request, organization, requester, UserModel });
        request.notification.platformEmailSentAt = now();
        request.notification.platformEmailError = "";
      } catch (error) {
        emailDelivered = false;
        request.notification.platformEmailError = String(error.message || "Email delivery failed.").slice(0, 500);
        console.error("Service plan request email error:", error.message);
      }
      await request.save();
      notifyPlatform({
        event: servicePlanChangeEvent(request, organization.name, "requested"),
        contextOrganizationId: organization._id,
      }).catch((notificationError) => {
        console.error("Service plan request notification error:", notificationError);
      });
      return res.status(201).json({ ...requestResult(request), emailDelivered });
    } catch (error) {
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Unable to submit the contract change request.",
      });
    }
  }

  async function respondToInformationRequest(req, res) {
    try {
      if (req.user?.role !== "admin" || req.user?.assumedOrganization) {
        return res.status(403).json({ error: "Organization administrator access required." });
      }
      const message = boundedText(req.body.message, "Additional information");
      const [request, organization, requester] = await Promise.all([
        RequestModel.findOne({
          _id: req.params.id,
          organizationId: req.user.organizationId,
          status: "information_requested",
        }),
        OrganizationModel.findById(req.user.organizationId),
        UserModel.findById(req.user.userId).select("email username"),
      ]);
      if (!request || !organization || !requester) {
        return res.status(404).json({ error: "Information request not found." });
      }
      request.messages.push({
        actorUserId: req.user.userId,
        actorScope: "organization_admin",
        message,
        createdAt: now(),
      });
      request.status = "pending_review";
      request.platformResponse = "";
      request.reviewedBy = null;
      request.reviewedAt = null;
      let emailDelivered = true;
      try {
        await sendPlatformEmail({ request, organization, requester, UserModel });
        request.notification.platformEmailSentAt = now();
        request.notification.platformEmailError = "";
      } catch (error) {
        emailDelivered = false;
        request.notification.platformEmailError = String(error.message || "Email delivery failed.").slice(0, 500);
      }
      await request.save();
      await PlatformAuditModel.create({
        ...auditDetails(req),
        action: auditAction(request, "information_supplied"),
        targetOrganizationId: organization._id,
        metadata: { requestId: request._id, changeType: request.changeType || "service_model" },
      });
      notifyPlatform({
        event: servicePlanChangeEvent(request, organization.name, "information_supplied"),
        contextOrganizationId: organization._id,
      }).catch((notificationError) => {
        console.error("Service plan information notification error:", notificationError);
      });
      return res.json({ ...requestResult(request), emailDelivered });
    } catch (error) {
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Unable to submit additional information.",
      });
    }
  }

  async function reviewRequest(req, res) {
    try {
      if (req.user?.platformRole !== "platform_admin" || req.user?.assumedOrganization) {
        return res.status(403).json({ error: "Platform administrator access required." });
      }
      const action = String(req.body.action || "").trim();
      if (!["approve", "deny", "request_information"].includes(action)) {
        return res.status(400).json({ error: "Select a valid review action." });
      }
      const response = boundedText(req.body.response, "Platform response", { required: action !== "approve" });
      const request = await RequestModel.findOne({
        _id: req.params.id,
        status: { $in: ACTIVE_STATUSES },
      });
      if (!request) return res.status(404).json({ error: "Active contract change request not found." });
      const [organization, requester] = await Promise.all([
        OrganizationModel.findById(request.organizationId),
        UserModel.findById(request.requestedBy).select("email username"),
      ]);
      if (!organization || !requester) return res.status(404).json({ error: "Request organization or requester not found." });
      if ((organization.serviceModel || "managed") !== request.currentServiceModel) {
        return res.status(409).json({ error: "The organization service model changed after this request was submitted." });
      }
      const currentEntitlements = resolveLicenseEntitlements(organization);
      if (request.currentLicenseTier != null && currentEntitlements.tier !== request.currentLicenseTier) {
        return res.status(409).json({ error: "The organization license tier changed after this request was submitted." });
      }
      const reviewedAt = now();
      request.platformResponse = response;
      request.reviewedBy = req.user.userId;
      request.reviewedAt = reviewedAt;
      request.messages.push({
        actorUserId: req.user.userId,
        actorScope: "platform_admin",
        message: response || "Approved and applied by Afterlight.",
        createdAt: reviewedAt,
      });
      let appliedEntitlements = null;
      let endedResourceDeploymentCount = 0;
      let revokedEmailApprovalAuthorizationCount = 0;
      let requestAppliedInTransaction = false;

      if (action === "approve") {
        if (request.changeType === "custom_capacity") {
          if (!METERED_SERVICE_MODELS.has(organization.serviceModel || "managed") || currentEntitlements.tier !== "tier_3") {
            return res.status(409).json({ error: "This organization is no longer on a Tier 3 tiered service plan." });
          }
          const approvedAdminLimit = customAdminLimit(
            request.organizationSnapshot?.requestedAdminLimit,
            currentEntitlements.adminLimit,
            { status: 409 }
          );
          const nextLicense = storedLicense(
            organization,
            organization.serviceModel,
            currentEntitlements.tier,
            req.user.userId,
            reviewedAt
          );
          nextLicense.adminLimit = approvedAdminLimit;
          nextLicense.userLimit = Math.max(currentEntitlements.userLimit || 0, nextLicense.userLimit || 0);
          nextLicense.propertyLimit = Math.max(currentEntitlements.propertyLimit || 0, nextLicense.propertyLimit || 0);
          organization.license = nextLicense;
          await organization.save();
          appliedEntitlements = resolveLicenseEntitlements(organization);
        } else if ((request.changeType || "service_model") === "license_tier") {
          if (!METERED_SERVICE_MODELS.has(organization.serviceModel || "managed")) {
            return res.status(409).json({ error: "This organization no longer uses a tiered service model." });
          }
          const approvedTier = licenseTier(request.requestedLicenseTier, { required: true });
          if (LICENSE_TIERS.indexOf(approvedTier) <= LICENSE_TIERS.indexOf(currentEntitlements.tier)) {
            return res.status(409).json({ error: "The requested tier is no longer higher than the organization's current tier." });
          }
          const nextLicense = storedLicense(
            organization,
            organization.serviceModel,
            approvedTier,
            req.user.userId,
            reviewedAt
          );
          nextLicense.adminLimit = Math.max(currentEntitlements.adminLimit || 0, nextLicense.adminLimit || 0);
          nextLicense.userLimit = Math.max(currentEntitlements.userLimit || 0, nextLicense.userLimit || 0);
          nextLicense.propertyLimit = Math.max(currentEntitlements.propertyLimit || 0, nextLicense.propertyLimit || 0);
          organization.license = nextLicense;
          await organization.save();
          appliedEntitlements = resolveLicenseEntitlements(organization);
        } else {
          const targetTier = METERED_SERVICE_MODELS.has(request.requestedServiceModel)
            ? licenseTier(request.requestedLicenseTier, { required: true })
            : null;
          const previousValue = {
            serviceModel: organization.serviceModel || "managed",
            licenseTier: currentEntitlements.tier,
            adminLimit: currentEntitlements.adminLimit,
            userLimit: currentEntitlements.userLimit,
            propertyLimit: currentEntitlements.propertyLimit,
            defaultSource: organizationDefaultSource(organization),
            policyVersion: Number(organization.fulfillmentPolicy?.version || 1),
            invoiceApprovalExperience:
              organization.billingCapabilities?.invoiceApprovalExperience || "authenticated_portal",
          };
          const clearedPropertyOverrides = (organization.properties || [])
            .filter((property) => property.fulfillmentPolicy?.defaultSource).length;
          const transition = await runServiceModelTransaction(async (session) => {
            for (const property of organization.properties || []) {
              property.fulfillmentPolicy = {
                defaultSource: null,
                updatedBy: req.user.userId,
                updatedAt: reviewedAt,
              };
            }
            organization.serviceModel = request.requestedServiceModel;
            organization.license = storedLicense(
              organization,
              request.requestedServiceModel,
              targetTier,
              req.user.userId,
              reviewedAt
            );
            organization.fulfillmentPolicy = {
              defaultSource: SERVICE_MODEL_DEFAULTS[request.requestedServiceModel],
              version: previousValue.policyVersion + 1,
              updatedBy: req.user.userId,
              updatedAt: reviewedAt,
            };
            if (!["managed", "hybrid"].includes(request.requestedServiceModel)) {
              organization.billingCapabilities = {
                invoiceApprovalExperience: "authenticated_portal",
                emailApprovalTokenHours: 24,
                updatedBy: req.user.userId,
                updatedAt: reviewedAt,
              };
            }
            await saveDocument(organization, session);

            let endedDeployments = { modifiedCount: 0 };
            if (request.requestedServiceModel === "platform") {
              endedDeployments = await updateMany(
                ResourceDeploymentModel,
                {
                  organizationId: organization._id,
                  status: { $in: ["active", "paused"] },
                },
                {
                  $set: {
                    status: "ended",
                    endsAt: reviewedAt,
                    updatedBy: req.user.userId,
                  },
                },
                session
              );
            }
            let revokedEmailApprovals = { modifiedCount: 0 };
            if (!["managed", "hybrid"].includes(request.requestedServiceModel)) {
              revokedEmailApprovals = await updateMany(
                InvoiceEmailAuthorizationModel,
                {
                  organizationId: organization._id,
                  status: "active",
                },
                {
                  $set: {
                    status: "revoked",
                    revokedAt: reviewedAt,
                  },
                },
                session
              );
            }
            const endedCount = Number(
              endedDeployments.modifiedCount ?? endedDeployments.nModified ?? 0
            );
            const revokedEmailApprovalCount = Number(
              revokedEmailApprovals.modifiedCount ?? revokedEmailApprovals.nModified ?? 0
            );
            const nextEntitlements = resolveLicenseEntitlements(organization);
            await createDocument(FulfillmentAuditModel, {
              organizationId: organization._id,
              ...auditDetails(req),
              entityType: "organization",
              entityId: organization._id.toString(),
              action: "service_model_change_approved",
              previousValue,
              nextValue: {
                serviceModel: organization.serviceModel,
                licenseTier: nextEntitlements.tier,
                adminLimit: nextEntitlements.adminLimit,
                userLimit: nextEntitlements.userLimit,
                propertyLimit: nextEntitlements.propertyLimit,
                defaultSource: organization.fulfillmentPolicy.defaultSource,
                policyVersion: organization.fulfillmentPolicy.version,
                invoiceApprovalExperience:
                  organization.billingCapabilities?.invoiceApprovalExperience || "authenticated_portal",
              },
              reason: response,
              metadata: {
                requestId: request._id,
                clearedPropertyOverrides,
                endedResourceDeploymentCount: endedCount,
                revokedEmailApprovalAuthorizationCount: revokedEmailApprovalCount,
                appliesTo: "future_assignments_only",
              },
            }, session);
            request.status = "approved";
            request.appliedAt = reviewedAt;
            await saveDocument(request, session);
            return {
              nextEntitlements,
              endedResourceDeploymentCount: endedCount,
              revokedEmailApprovalAuthorizationCount: revokedEmailApprovalCount,
            };
          });
          appliedEntitlements = transition.nextEntitlements;
          endedResourceDeploymentCount = transition.endedResourceDeploymentCount;
          revokedEmailApprovalAuthorizationCount =
            transition.revokedEmailApprovalAuthorizationCount;
          requestAppliedInTransaction = true;
        }
        if (!requestAppliedInTransaction) {
          request.status = "approved";
          request.appliedAt = reviewedAt;
        }
      } else if (action === "deny") {
        request.status = "denied";
      } else {
        request.status = "information_requested";
      }

      let emailDelivered = true;
      try {
        await sendRequesterEmail({ request, organization, requester });
        request.notification.requesterEmailSentAt = now();
        request.notification.requesterEmailError = "";
      } catch (error) {
        emailDelivered = false;
        request.notification.requesterEmailError = String(error.message || "Email delivery failed.").slice(0, 500);
        console.error("Service plan decision email error:", error.message);
      }
      await request.save();
      await PlatformAuditModel.create({
        ...auditDetails(req),
        action: auditAction(request, request.status),
        targetOrganizationId: organization._id,
        metadata: {
          requestId: request._id,
          changeType: request.changeType || "service_model",
          currentServiceModel: request.currentServiceModel,
          requestedServiceModel: request.requestedServiceModel,
          currentLicenseTier: request.currentLicenseTier || null,
          requestedLicenseTier: request.requestedLicenseTier || null,
          currentLimits: {
            admin: request.organizationSnapshot?.currentAdminLimit ?? null,
            users: request.organizationSnapshot?.currentUserLimit ?? null,
            properties: request.organizationSnapshot?.currentPropertyLimit ?? null,
          },
          requestedLimits: {
            admin: appliedEntitlements?.adminLimit ?? request.organizationSnapshot?.requestedAdminLimit ?? null,
            users: appliedEntitlements?.userLimit ?? request.organizationSnapshot?.requestedUserLimit ?? null,
            properties: appliedEntitlements?.propertyLimit ?? request.organizationSnapshot?.requestedPropertyLimit ?? null,
          },
          currentAfterlightPortfolioMinimumPercent:
            request.organizationSnapshot?.currentAfterlightPortfolioMinimumPercent ?? null,
          requestedAfterlightPortfolioMinimumPercent:
            appliedEntitlements?.afterlightPortfolioMinimumPercent
              ?? request.organizationSnapshot?.requestedAfterlightPortfolioMinimumPercent
              ?? null,
          endedResourceDeploymentCount,
          revokedEmailApprovalAuthorizationCount,
        },
      });
      notifyUser({
        organizationId: organization._id,
        userId: requester._id,
        ...servicePlanChangeEvent(request, organization.name, request.status),
      }).catch((notificationError) => {
        console.error("Service plan decision notification error:", notificationError);
      });
      return res.json({ ...requestResult(request), emailDelivered });
    } catch (error) {
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Unable to review the contract change request.",
      });
    }
  }

  return { createRequest, respondToInformationRequest, reviewRequest };
}

const handlers = createServiceModelChangeHandlers();

router.get("/", requireOrganizationAdmin, async (req, res) => {
  try {
    const requests = await populatedRequest(
      ServiceModelChangeRequest.find({ organizationId: req.user.organizationId })
        .sort({ createdAt: -1 })
        .limit(25)
    );
    return res.json(requests.map(requestResult));
  } catch (error) {
    return res.status(500).json({ error: "Unable to load contract change requests." });
  }
});

router.post("/", requireOrganizationAdmin, handlers.createRequest);
router.post("/:id/respond", requireOrganizationAdmin, handlers.respondToInformationRequest);

router.get("/platform", requirePlatformAdmin, async (_req, res) => {
  try {
    const requests = await populatedRequest(
      ServiceModelChangeRequest.find({})
        .sort({ status: 1, createdAt: -1 })
        .limit(250)
    );
    return res.json(requests.map(requestResult));
  } catch (error) {
    return res.status(500).json({ error: "Unable to load platform contract change requests." });
  }
});

router.post("/platform/:id/review", requirePlatformAdmin, handlers.reviewRequest);

module.exports = router;
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports.boundedText = boundedText;
module.exports.createServiceModelChangeHandlers = createServiceModelChangeHandlers;
module.exports.requestResult = requestResult;
