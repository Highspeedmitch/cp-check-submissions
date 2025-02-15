const express = require("express");
const router = express.Router();
const Organization = require("../models/organization");

// ✅ Global Search for Properties (Admins Only)
router.get("/search", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
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
    const { region } = req.params;

    // Fetch properties within the user's organization
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    // If the user is not an admin, return an empty array (instead of a 403 error)
    if (req.user.role !== "admin") {
      return res.json([]);
    }

    // For admins, filter properties by region (case-insensitive)
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
    if (req.user.role !== "admin") {
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

// GET /api/properties/regions
router.get(
  "/regions", 
  async (req, res) => {
    try {
      // 2) check role
      if (req.user.role !== "admin") {
        return res
          .status(403)
          .json({ error: "Only admins can view regions." });
      }

      // 3) find the org
      const org = await Organization.findById(req.user.organizationId);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      // 4) extract unique regions
      const uniqueRegions = [
        ...new Set(org.properties.map((p) => p.region).filter(Boolean))
      ];

      res.json(uniqueRegions);
    } catch (error) {
      console.error("Error fetching regions:", error);
      res.status(500).json({ error: "Server error fetching regions" });
    }
  }
);

module.exports = router;

