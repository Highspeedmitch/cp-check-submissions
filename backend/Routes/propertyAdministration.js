const express = require("express");
const Organization = require("../models/organization");
const User = require("../models/user");
const { canAccessProperty } = require("../services/propertyAccess");
const { consumeGrant } = require("../services/organizationPasskeys");

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
    if (!await consumeGrant({
      organization,
      userId: req.user.userId,
      purpose: "add_property",
      token: req.body.adminActionGrant,
    })) {
      return res.status(403).json({ error: "Administrative verification expired or is invalid." });
    }
    const {
      name, lat, lng, emails, region, accessInstructions, customFields,
      maintenanceInfo, generalInfo, propertyCode, physicalAddress, billingAddress,
      defaultInspectionAmountCents, apMethod, apEmail, apPortal,
      billingInstructions, purchaseOrder, propertyManagerId,
    } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Property name is required" });
    }
    const isSTR = organization.orgType === "STR";
    const isCOM = organization.orgType === "COM";
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
      }).select("_id").lean();
      if (!assignedPropertyManager) {
        return res.status(400).json({
          error: "Select an active property manager from this organization.",
        });
      }
    }
    organization.properties.push({
      name,
      lat,
      lng,
      emails: emails || [],
      propertyManagers: assignedPropertyManager ? [assignedPropertyManager._id] : [],
      region,
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
      orgType: organization.orgType,
      ...(isSTR && {
        accessInstructions: accessInstructions || "No instructions provided.",
        maintenanceInfo: maintenanceInfo || "",
        generalInfo: generalInfo || "",
        customFields: Array.isArray(customFields) ? customFields : [],
      }),
    });
    await organization.save();
    const savedProperty = organization.properties.find((property) => property.name === name);
    return res.json({
      success: true,
      message: "Property added successfully",
      propertyName: savedProperty ? savedProperty.name : null,
    });
  } catch (error) {
    console.error("Error adding property:", error);
    return res.status(500).json({ error: "Server error adding property" });
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
    if (!canAccessProperty(property, req.user)) {
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
    property.region = req.body.region || property.region;
    await organization.save();
    return res.json({ success: true, message: "Property updated successfully" });
  } catch (error) {
    console.error("Error updating property:", error);
    return res.status(500).json({ error: "Server error updating property" });
  }
});

router.delete("/property/:propertyName", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden - Admin only" });
    }
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    if (!await consumeGrant({
      organization,
      userId: req.user.userId,
      purpose: "remove_property",
      token: req.body.adminActionGrant,
    })) {
      return res.status(403).json({ error: "Administrative verification expired or is invalid." });
    }
    const propertyName = decodeURIComponent(req.params.propertyName);
    const propertyIndex = organization.properties.findIndex((property) => property.name === propertyName);
    if (propertyIndex === -1) {
      return res.status(404).json({ error: "Property not found" });
    }
    organization.properties.splice(propertyIndex, 1);
    await organization.save();
    return res.json({ success: true, message: `Property "${propertyName}" removed.` });
  } catch (error) {
    console.error("Error removing property:", error);
    return res.status(500).json({ error: "Server error removing property" });
  }
});

module.exports = router;
