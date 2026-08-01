const express = require("express");
const Organization = require("../models/organization");
const FulfillmentAudit = require("../models/fulfillmentAudit");
const {
  SERVICE_MODELS,
  FULFILLMENT_SOURCES,
  SERVICE_MODEL_DEFAULTS,
  SOURCE_POLICIES,
  validateServiceModel,
  validateFulfillmentSource,
  organizationDefaultSource,
  propertyDefaultSource,
} = require("../services/fulfillmentPolicy");

const router = express.Router();

function requireOrganizationAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Organization administrator access required." });
  return next();
}

function requestAuditDetails(req) {
  return {
    actorUserId: req.user.userId,
    ipAddress: req.ip || "",
    userAgent: typeof req.get === "function" ? req.get("user-agent") || "" : "",
  };
}

function serializeSettings(organization) {
  const organizationSource = organizationDefaultSource(organization);
  return {
    organization: {
      id: organization._id,
      name: organization.name,
      serviceModel: organization.serviceModel || "managed",
      defaultSource: organizationSource,
      policyVersion: Number(organization.fulfillmentPolicy?.version || 1),
      updatedAt: organization.fulfillmentPolicy?.updatedAt || null,
    },
    properties: (organization.properties || []).map((property) => ({
      id: property._id,
      name: property.name,
      defaultSource: property.fulfillmentPolicy?.defaultSource || null,
      resolvedSource: propertyDefaultSource(organization, property),
      inheritsOrganizationDefault: !property.fulfillmentPolicy?.defaultSource,
      updatedAt: property.fulfillmentPolicy?.updatedAt || null,
    })),
    options: {
      serviceModels: SERVICE_MODELS,
      fulfillmentSources: FULFILLMENT_SOURCES,
      serviceModelDefaults: SERVICE_MODEL_DEFAULTS,
      sourcePolicies: SOURCE_POLICIES,
    },
  };
}

router.get("/", requireOrganizationAdmin, async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ error: "Organization not found." });
    return res.json(serializeSettings(organization));
  } catch (error) {
    return res.status(500).json({ error: "Unable to load service delivery settings." });
  }
});

router.put("/organization", requireOrganizationAdmin, async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ error: "Organization not found." });

    const previousValue = {
      serviceModel: organization.serviceModel || "managed",
      defaultSource: organizationDefaultSource(organization),
      policyVersion: Number(organization.fulfillmentPolicy?.version || 1),
    };
    const serviceModel = validateServiceModel(req.body.serviceModel ?? previousValue.serviceModel);
    const defaultSource = validateFulfillmentSource(
      req.body.defaultSource ?? (serviceModel !== previousValue.serviceModel
        ? SERVICE_MODEL_DEFAULTS[serviceModel]
        : previousValue.defaultSource)
    );
    const changed = serviceModel !== previousValue.serviceModel || defaultSource !== previousValue.defaultSource;
    if (!changed) return res.json(serializeSettings(organization));

    organization.serviceModel = serviceModel;
    organization.fulfillmentPolicy = {
      defaultSource,
      version: previousValue.policyVersion + 1,
      updatedBy: req.user.userId,
      updatedAt: new Date(),
    };
    await organization.save();
    await FulfillmentAudit.create({
      organizationId: organization._id,
      ...requestAuditDetails(req),
      entityType: "organization",
      entityId: organization._id.toString(),
      action: "organization_fulfillment_policy_updated",
      previousValue,
      nextValue: {
        serviceModel,
        defaultSource,
        policyVersion: organization.fulfillmentPolicy.version,
      },
      reason: String(req.body.reason || "").trim(),
      metadata: { appliesTo: "future_assignments_only" },
    });
    return res.json(serializeSettings(organization));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to update service delivery settings.",
    });
  }
});

router.put("/properties/:propertyId", requireOrganizationAdmin, async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    const property = organization?.properties.id(req.params.propertyId);
    if (!property) return res.status(404).json({ error: "Property not found." });

    const previousSource = property.fulfillmentPolicy?.defaultSource || null;
    const requested = req.body.defaultSource;
    const nextSource = requested === null || requested === "" ? null : validateFulfillmentSource(requested);
    if (nextSource === previousSource) return res.json(serializeSettings(organization));

    property.fulfillmentPolicy = {
      defaultSource: nextSource,
      updatedBy: req.user.userId,
      updatedAt: new Date(),
    };
    await organization.save();
    await FulfillmentAudit.create({
      organizationId: organization._id,
      ...requestAuditDetails(req),
      entityType: "property",
      entityId: property._id.toString(),
      action: nextSource ? "property_fulfillment_override_updated" : "property_fulfillment_override_removed",
      previousValue: { defaultSource: previousSource },
      nextValue: {
        defaultSource: nextSource,
        resolvedSource: propertyDefaultSource(organization, property),
      },
      reason: String(req.body.reason || "").trim(),
      metadata: { propertyName: property.name, appliesTo: "future_assignments_only" },
    });
    return res.json(serializeSettings(organization));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Unable to update the property fulfillment default.",
    });
  }
});

router.get("/audit", requireOrganizationAdmin, async (req, res) => {
  try {
    const history = await FulfillmentAudit.find({ organizationId: req.user.organizationId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("actorUserId", "email");
    return res.json(history);
  } catch (error) {
    return res.status(500).json({ error: "Unable to load fulfillment audit history." });
  }
});

module.exports = router;
