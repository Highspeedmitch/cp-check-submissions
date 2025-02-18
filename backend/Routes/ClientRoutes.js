const express = require("express");
const router = express.Router();
const Communication = require("./models/communication");
const Organization = require("./models/organization");

// ✅ Admin Creates a New Communication
router.post("/communications", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can create communications." });
    }

    const { propertyId, message } = req.body;

    // Ensure the admin's organization owns the property
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    const property = organization.properties.find(p => p._id.toString() === propertyId);
    if (!property) {
      return res.status(404).json({ error: "Property not found in your organization." });
    }

    const newCommunication = new Communication({
      propertyId,
      organizationId: req.user.organizationId,
      message,
    });

    await newCommunication.save();
    res.status(201).json({ message: "Communication created successfully!" });
  } catch (error) {
    console.error("Error creating communication:", error);
    res.status(500).json({ error: "Server error creating communication." });
  }
});

// ✅ Clients Retrieve Communications for Their Property
router.get("/communications/:propertyId", async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Only clients can view communications." });
    }

    const { propertyId } = req.params;
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    // Ensure the property is part of this client's organization
    const property = organization.properties.find(p => p._id.toString() === propertyId);
    if (!property) {
      return res.status(404).json({ error: "Property not found in your organization." });
    }

    // Fetch communications for the property
    const communications = await Communication.find({ propertyId }).sort({ date: -1 });
    res.json(communications);
  } catch (error) {
    console.error("Error fetching communications:", error);
    res.status(500).json({ error: "Server error fetching communications." });
  }
});

module.exports = router;
