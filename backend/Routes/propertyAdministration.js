const express = require("express");
const Organization = require("../models/organization");
const User = require("../models/user");
const FulfillmentAudit = require("../models/fulfillmentAudit");
const { canAccessProperty } = require("../services/propertyAccess");
const { consumeGrant } = require("../services/organizationPasskeys");
const {
  propertyRemovalErrorBody,
  propertyRemovalImpact,
  removeProperty,
} = require("../services/propertyRemoval");
const { currentLicenseCapacity } = require("../services/licenseCapacity");
const {
  licensedCapacityErrorBody,
  reserveLicensedCapacity,
} = require("../services/licensedCapacityOperations");
const { normalizePropertyEmails } = require("../services/propertyEmails");
const {
  validateFulfillmentSourceForServiceModel,
  propertyDefaultSource,
} = require("../services/fulfillmentPolicy");
const { activeRoutes, normalizeRegion, routePropertyIds } = require("../services/routeScopes");
const {
  normalizePropertySquareFeet,
  normalizePropertyType,
} = require("../services/boutiquePolicy");

const router = express.Router();

router.post("/add-property", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const {
      name, lat, lng, emails, region, accessInstructions, customFields,
      maintenanceInfo, generalInfo, propertyCode, physicalAddress, billingAddress,
      defaultInspectionAmountCents, apMethod, apEmail, apPortal,
      billingInstructions, purchaseOrder, propertyManagerId,
      defaultFulfillmentSource,
      grossSquareFeet, propertyType,
    } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Property name is required" });
    }
    const isSTR = organization.orgType === "STR";
    const isCOM = organization.orgType === "COM";
    const fulfillmentOverride = defaultFulfillmentSource
      ? validateFulfillmentSourceForServiceModel(defaultFulfillmentSource, organization)
      : null;
    const normalizedGrossSquareFeet = normalizePropertySquareFeet(
      grossSquareFeet,
      organization,
      { required: organization.serviceModel === "boutique" }
    );
    const normalizedPropertyType = normalizePropertyType(
      propertyType,
      organization,
      { required: organization.serviceModel === "boutique" }
    );
    if (isCOM && (!propertyCode || !physicalAddress || !billingAddress)) {
      return res.status(400).json({
        error: "Property code, physical address, and billing address are required for commercial properties.",
      });
    }
    let assignedPropertyManager = null;
    if (propertyManagerId) {
      assignedPropertyManager = await User.findOne({
        _id: propertyManagerId,
        organizationId: organization._id,
        role: "property_manager",
        accountStatus: { $ne: "inactive" },
        organizationArchivedAt: null,
      }).select("_id email").lean();
      if (!assignedPropertyManager) {
        return res.status(400).json({
          error: "Select an active property manager from this organization.",
        });
      }
    }
    const transactionResult = await reserveLicensedCapacity({
      organizationId: organization._id,
      dimension: "properties",
      additional: 1,
      actorUserId: req.user.userId,
      work: async ({ organization: currentOrganization, session }) => {
        if (!await consumeGrant({
          organization: currentOrganization,
          userId: req.user.userId,
          purpose: "add_property",
          token: req.body.adminActionGrant,
          session,
        })) {
          const grantError = new Error("Administrative verification expired or is invalid.");
          grantError.status = 403;
          grantError.code = "ADMIN_GRANT_INVALID";
          throw grantError;
        }
        currentOrganization.properties.push({
          name,
          grossSquareFeet: normalizedGrossSquareFeet,
          propertyType: normalizedPropertyType,
          lat,
          lng,
          emails: normalizePropertyEmails(emails || [], {
            automaticEmails: assignedPropertyManager ? [assignedPropertyManager.email] : [],
          }),
          propertyManagers: assignedPropertyManager ? [assignedPropertyManager._id] : [],
          fulfillmentPolicy: {
            defaultSource: fulfillmentOverride,
            updatedBy: fulfillmentOverride ? req.user.userId : null,
            updatedAt: fulfillmentOverride ? new Date() : null,
          },
          region: normalizeRegion(region),
          ...(isCOM && {
            propertyCode: propertyCode.trim(),
            physicalAddress: physicalAddress.trim(),
            billingAddress: billingAddress.trim(),
            defaultInspectionAmountCents: Number.isInteger(defaultInspectionAmountCents)
              ? defaultInspectionAmountCents
              : null,
            apMethod: apMethod || "download",
            apEmail: apEmail || "",
            apPortal: apPortal || "",
            billingInstructions: billingInstructions || "",
            purchaseOrder: purchaseOrder || "",
          }),
          orgType: currentOrganization.orgType,
          ...(isSTR && {
            accessInstructions: accessInstructions || "No instructions provided.",
            maintenanceInfo: maintenanceInfo || "",
            generalInfo: generalInfo || "",
            customFields: Array.isArray(customFields) ? customFields : [],
          }),
        });
        const createdProperty = currentOrganization.properties[currentOrganization.properties.length - 1];
        if (fulfillmentOverride && createdProperty) {
          await FulfillmentAudit.create([{
            organizationId: currentOrganization._id,
            actorUserId: req.user.userId,
            entityType: "property",
            entityId: createdProperty._id.toString(),
            action: "property_fulfillment_override_created",
            previousValue: { defaultSource: null },
            nextValue: {
              defaultSource: fulfillmentOverride,
              resolvedSource: propertyDefaultSource(currentOrganization, createdProperty),
            },
            metadata: {
              propertyName: createdProperty.name,
              createdDuringPropertySetup: true,
              appliesTo: "future_assignments_only",
            },
            ipAddress: req.ip || "",
            userAgent: typeof req.get === "function" ? req.get("user-agent") || "" : "",
          }], { session });
        }
        return createdProperty;
      },
    });
    const currentOrganization = transactionResult.organization;
    const savedProperty = transactionResult.value;
    return res.json({
      success: true,
      message: "Property added successfully",
      propertyName: savedProperty ? savedProperty.name : null,
      fulfillmentSource: savedProperty
        ? propertyDefaultSource(currentOrganization, savedProperty)
        : null,
      fulfillmentInherited: !fulfillmentOverride,
      capacity: await currentLicenseCapacity({ organization: currentOrganization }),
    });
  } catch (error) {
    console.error("Error adding property:", error);
    return res.status(error.status || 500).json(
      licensedCapacityErrorBody(error, "Server error adding property")
    );
  }
});

router.put("/edit-property/:propertyName", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const propertyName = decodeURIComponent(req.params.propertyName);
    const property = organization.properties.find((item) => item.name === propertyName);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }
    if (!canAccessProperty(property, req.user, organization)) {
      return res.status(403).json({ error: "You do not manage this property." });
    }
    if (organization.orgType !== "STR") {
      return res.status(403).json({ error: "Access Instructions only allowed for STR organizations." });
    }
    property.accessInstructions = req.body.accessInstructions || property.accessInstructions;
    property.customFields = Array.isArray(req.body.customFields)
      ? req.body.customFields
      : property.customFields;
    property.maintenanceInfo = req.body.maintenanceInfo || property.maintenanceInfo;
    property.generalInfo = req.body.generalInfo || property.generalInfo;
    const nextRegion = normalizeRegion(req.body.region ?? property.region);
    const containingRoute = activeRoutes(organization).find((route) =>
      routePropertyIds(route).includes(String(property._id))
    );
    if (containingRoute
      && normalizeRegion(property.region).toLowerCase() !== nextRegion.toLowerCase()) {
      return res.status(409).json({
        error: `Remove this property from ${containingRoute.name} before changing its region.`,
      });
    }
    property.region = nextRegion;
    await organization.save();
    return res.json({ success: true, message: "Property updated successfully" });
  } catch (error) {
    console.error("Error updating property:", error);
    return res.status(500).json({ error: "Server error updating property" });
  }
});

router.get("/property/:propertyIdentifier/removal-impact", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden - Admin only" });
    }
    const impact = await propertyRemovalImpact({
      organizationId: req.user.organizationId,
      propertyIdentifier: req.params.propertyIdentifier,
    });
    return res.json(impact);
  } catch (error) {
    if (!error.status) console.error("Property removal impact error:", error);
    return res.status(error.status || 500).json(propertyRemovalErrorBody(
      error,
      "Unable to check whether the property can be removed."
    ));
  }
});

router.delete("/property/:propertyIdentifier", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden - Admin only" });
    }
    const result = await removeProperty({
      organizationId: req.user.organizationId,
      propertyIdentifier: req.params.propertyIdentifier,
      actorUserId: req.user.userId,
      adminActionGrant: req.body.adminActionGrant,
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    return res.json({
      success: true,
      message: `Property "${result.propertyName}" removed.`,
      ...result,
    });
  } catch (error) {
    if (!error.status) console.error("Error removing property:", error);
    return res.status(error.status || 500).json(propertyRemovalErrorBody(error));
  }
});

module.exports = router;
