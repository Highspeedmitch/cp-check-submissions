const express = require("express");
const Organization = require("../models/organization");

const router = express.Router();

router.get("/:propertyName", async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const propertyName = decodeURIComponent(req.params.propertyName);
    const property = organization.properties.find((item) => item.name === propertyName);
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }
    if (organization.orgType !== "STR") {
      return res.status(403).json({ error: "Access instructions only apply to STR organizations." });
    }
    return res.json({
      instructions: property.accessInstructions || "",
      maintenanceInfo: property.maintenanceInfo || "",
      generalInfo: property.generalInfo || "",
    });
  } catch (error) {
    console.error("Error fetching access instructions:", error);
    return res.status(500).json({ error: "Server error fetching instructions." });
  }
});

router.put("/:propertyName", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden. Only admins can update instructions." });
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
    if (organization.orgType !== "STR") {
      return res.status(403).json({ error: "Only STR orgs can have access instructions." });
    }
    property.accessInstructions = req.body.instructions || property.accessInstructions;
    property.maintenanceInfo = req.body.maintenanceInfo || property.maintenanceInfo;
    property.generalInfo = req.body.generalInfo || property.generalInfo;
    await organization.save();
    return res.json({ message: "Instructions updated successfully!" });
  } catch (error) {
    console.error("Error saving access instructions:", error);
    return res.status(500).json({ error: "Server error saving instructions." });
  }
});

module.exports = router;
