const express = require("express");
const Organization = require("../models/organization");
const User = require("../models/user");
const ServiceModelChangeRequest = require("../models/serviceModelChangeRequest");
const PlatformAudit = require("../models/platformAudit");
const FulfillmentAudit = require("../models/fulfillmentAudit");
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
const { serviceModelChangeEvent } = require("../services/notificationEvents");

const router = express.Router();
const ACTIVE_STATUSES = ["pending_review", "information_requested"];

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
    currentServiceModel: value.currentServiceModel,
    requestedServiceModel: value.requestedServiceModel,
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

function createServiceModelChangeHandlers({
  RequestModel = ServiceModelChangeRequest,
  OrganizationModel = Organization,
  UserModel = User,
  PlatformAuditModel = PlatformAudit,
  FulfillmentAuditModel = FulfillmentAudit,
  sendPlatformEmail = deliverPlatformRequestEmail,
  sendRequesterEmail = deliverRequesterDecisionEmail,
  notifyPlatform = notifyPlatformAdministrators,
  notifyUser = sendUserNotification,
  now = () => new Date(),
} = {}) {
  async function createRequest(req, res) {
    try {
      if (req.user?.role !== "admin" || req.user?.assumedOrganization) {
        return res.status(403).json({ error: "Organization administrator access required." });
      }
      const requestedServiceModel = validateServiceModel(req.body.requestedServiceModel);
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
      if (existing) return res.status(409).json({ error: "This organization already has an active service model request." });
      const currentServiceModel = organization.serviceModel || "managed";
      if (requestedServiceModel === currentServiceModel) {
        return res.status(400).json({ error: "Select a service model different from the current contract." });
      }
      const requestedAt = now();
      const properties = organization.properties || [];
      const request = await RequestModel.create({
        organizationId: organization._id,
        requestedBy: requester._id,
        currentServiceModel,
        requestedServiceModel,
        reason,
        proposedEffectiveDate: proposedDate(req.body.proposedEffectiveDate),
        organizationSnapshot: {
          propertyCount: properties.length,
          propertyOverrideCount: properties.filter((property) => property.fulfillmentPolicy?.defaultSource).length,
          defaultFulfillmentSource: organizationDefaultSource(organization),
          policyVersion: Number(organization.fulfillmentPolicy?.version || 1),
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
        action: "service_model_change_requested",
        targetOrganizationId: organization._id,
        metadata: {
          requestId: request._id,
          currentServiceModel,
          requestedServiceModel,
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
        console.error("Service model request email error:", error.message);
      }
      await request.save();
      notifyPlatform({
        event: serviceModelChangeEvent(request, organization.name, "requested"),
        contextOrganizationId: organization._id,
      }).catch((notificationError) => {
        console.error("Service model request notification error:", notificationError);
      });
      return res.status(201).json({ ...requestResult(request), emailDelivered });
    } catch (error) {
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Unable to submit the service model request.",
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
        action: "service_model_change_information_supplied",
        targetOrganizationId: organization._id,
        metadata: { requestId: request._id },
      });
      notifyPlatform({
        event: serviceModelChangeEvent(request, organization.name, "information_supplied"),
        contextOrganizationId: organization._id,
      }).catch((notificationError) => {
        console.error("Service model information notification error:", notificationError);
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
      if (!request) return res.status(404).json({ error: "Active service model request not found." });
      const [organization, requester] = await Promise.all([
        OrganizationModel.findById(request.organizationId),
        UserModel.findById(request.requestedBy).select("email username"),
      ]);
      if (!organization || !requester) return res.status(404).json({ error: "Request organization or requester not found." });
      if ((organization.serviceModel || "managed") !== request.currentServiceModel) {
        return res.status(409).json({ error: "The organization service model changed after this request was submitted." });
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

      if (action === "approve") {
        const previousValue = {
          serviceModel: organization.serviceModel || "managed",
          defaultSource: organizationDefaultSource(organization),
          policyVersion: Number(organization.fulfillmentPolicy?.version || 1),
        };
        const clearedPropertyOverrides = (organization.properties || [])
          .filter((property) => property.fulfillmentPolicy?.defaultSource).length;
        for (const property of organization.properties || []) {
          property.fulfillmentPolicy = {
            defaultSource: null,
            updatedBy: req.user.userId,
            updatedAt: reviewedAt,
          };
        }
        organization.serviceModel = request.requestedServiceModel;
        organization.fulfillmentPolicy = {
          defaultSource: SERVICE_MODEL_DEFAULTS[request.requestedServiceModel],
          version: previousValue.policyVersion + 1,
          updatedBy: req.user.userId,
          updatedAt: reviewedAt,
        };
        await organization.save();
        request.status = "approved";
        request.appliedAt = reviewedAt;
        await FulfillmentAuditModel.create({
          organizationId: organization._id,
          ...auditDetails(req),
          entityType: "organization",
          entityId: organization._id.toString(),
          action: "service_model_change_approved",
          previousValue,
          nextValue: {
            serviceModel: organization.serviceModel,
            defaultSource: organization.fulfillmentPolicy.defaultSource,
            policyVersion: organization.fulfillmentPolicy.version,
          },
          reason: response,
          metadata: {
            requestId: request._id,
            clearedPropertyOverrides,
            appliesTo: "future_assignments_only",
          },
        });
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
        console.error("Service model decision email error:", error.message);
      }
      await request.save();
      await PlatformAuditModel.create({
        ...auditDetails(req),
        action: `service_model_change_${request.status}`,
        targetOrganizationId: organization._id,
        metadata: {
          requestId: request._id,
          currentServiceModel: request.currentServiceModel,
          requestedServiceModel: request.requestedServiceModel,
        },
      });
      notifyUser({
        organizationId: organization._id,
        userId: requester._id,
        ...serviceModelChangeEvent(request, organization.name, request.status),
      }).catch((notificationError) => {
        console.error("Service model decision notification error:", notificationError);
      });
      return res.json({ ...requestResult(request), emailDelivered });
    } catch (error) {
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Unable to review the service model request.",
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
    return res.status(500).json({ error: "Unable to load service model requests." });
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
    return res.status(500).json({ error: "Unable to load platform service model requests." });
  }
});

router.post("/platform/:id/review", requirePlatformAdmin, handlers.reviewRequest);

module.exports = router;
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports.boundedText = boundedText;
module.exports.createServiceModelChangeHandlers = createServiceModelChangeHandlers;
module.exports.requestResult = requestResult;
