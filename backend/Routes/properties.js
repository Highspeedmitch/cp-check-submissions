const express = require("express");
const router = express.Router();
const Organization = require("../models/organization");

// ✅ Global Search for Properties (Admins Only)
router.get("/search", async (req, res) => {
  try {
    if (req.user.userType !== "admin") {
      return res.status(403).json({ error: "Only admins can search properties." });
    }

    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: "Missing search query" });
    }

    // Fetch properties within the admin's organization that match the query
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    // Case-insensitive search on properties
    const matchingProperties = organization.properties.filter(property =>
      property.name.toLowerCase().includes(q.toLowerCase())
    );

    res.json(matchingProperties);
  } catch (error) {
    console.error("Error searching properties:", error);
    res.status(500).json({ error: "Server error searching properties." });
  }
});

// ✅ Get Properties by Region (Admins Only)
router.get("/region/:region", async (req, res) => {
  try {
    if (req.user.userType !== "admin") {
      return res.status(403).json({ error: "Only admins can filter properties by region." });
    }

    const { region } = req.params;

    // Fetch properties within the admin's organization that match the region
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    const propertiesByRegion = organization.properties.filter(property =>
      property.region.toLowerCase() === region.toLowerCase()
    );

    res.json(propertiesByRegion);
  } catch (error) {
    console.error("Error fetching properties by region:", error);
    res.status(500).json({ error: "Server error fetching properties by region." });
  }
});

// ✅ Update Property Region (Admins Only)
router.put("/:propertyId/region", async (req, res) => {
  try {
    if (req.user.userType !== "admin") {
      return res.status(403).json({ error: "Only admins can update property regions." });
    }

    const { propertyId } = req.params;
    const { region } = req.body;

    // Find the organization
    const organization = await Organization.findOne({ "properties._id": propertyId });
    if (!organization) {
      return res.status(404).json({ error: "Property not found." });
    }

    const property = organization.properties.id(propertyId);
    if (!property) {
      return res.status(404).json({ error: "Property not found within organization." });
    }

    property.region = region;
    await organization.save();

    res.json({ message: "Property region updated successfully!", property });
  } catch (error) {
    console.error("Error updating property region:", error);
    res.status(500).json({ error: "Server error updating property region." });
  }
});

module.exports = router;
