const express = require("express");
const router = express.Router();
const Communication = require("../models/Communication");
const Organization = require("../models/organization");
const User = require("../models/user");
const authenticateToken = require("../middleware/authenticateToken");

// ✅ Protect all routes with authentication middleware
router.use(authenticateToken);

// ✅ Admin Creates a New Communication
router.post("/communications", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can create communications." });
    }
    
    const { propertyId, message } = req.body;

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

    // Ensure the property exists and that the client is assigned to it
    const property = organization.properties.find(p => p._id.toString() === propertyId);
    if (!property) {
      return res.status(404).json({ error: "Property not found in your organization." });
    }

    // Ensure the client is an owner of the property
    if (!property.clientOwners?.some(clientId => clientId.toString() === req.user.id)) {
      return res.status(403).json({ error: "You are not assigned to this property." });
    }

    const communications = await Communication.find({ propertyId }).sort({ date: -1 });
    res.json(communications);
  } catch (error) {
    console.error("Error fetching communications:", error);
    res.status(500).json({ error: "Server error fetching communications." });
  }
});

// ✅ Assign a Client to a Property
router.post("/assign-client", async (req, res) => {
  try {
    const { propertyName, clientEmail } = req.body;

    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can assign clients." });
    }

    // Find the organization
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    // Find the client in the organization
    const client = await User.findOne({
      email: clientEmail,
      organizationId: req.user.organizationId,
      role: "client",
    });

    if (!client) {
      return res.status(404).json({ error: "No registered client with this email." });
    }

    // Find the property
    const property = organization.properties.find(p => p.name === propertyName);
    if (!property) {
      return res.status(404).json({ error: "Property not found in this organization." });
    }

    // Ensure `clientOwners` is an array
    if (!Array.isArray(property.clientOwners)) {
      property.clientOwners = [];
    }

    // ✅ Store the Client’s `_id` (MongoDB ObjectId) instead of Email
    if (!property.clientOwners.some(ownerId => ownerId.toString() === client._id.toString())) {
      property.clientOwners.push(client._id); // ✅ Push the ObjectId
    }

    await organization.save();
    res.json({ message: `Client ${clientEmail} assigned to ${propertyName}` });
  } catch (error) {
    console.error("Error assigning client:", error);
    res.status(500).json({ error: "Server error assigning client." });
  }
});

// ✅ Fetch Client's Assigned Properties
router.get("/client-properties", async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Only clients can access this information." });
    }

    const organization = await Organization.findById(req.user.organizationId).lean();
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    // ✅ Filter properties where the logged-in client is an owner
    const clientProperties = organization.properties.filter(p =>
      p.clientOwners?.some(ownerId => ownerId.toString() === req.user.id)
    );

    res.json(clientProperties);
  } catch (error) {
    console.error("Error fetching client properties:", error);
    res.status(500).json({ error: "Server error fetching properties." });
  }
});

module.exports = router;
