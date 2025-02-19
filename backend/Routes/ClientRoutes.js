const express = require("express");
const router = express.Router();
const Communication = require("../models/Communication");
const Organization = require("../models/organization");
const User = require("../models/user");
const authenticateToken = require("../middleware/authenticateToken");
const mongoose = require("mongoose");

// ✅ All routes below require authentication
router.use(authenticateToken);

/**
 * ADMIN: Create a New Communication
 */
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
    
    // Ensure property belongs to the organization
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

/**
 * CLIENT: Retrieve Communications for a Single Property
 */
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
    
    // Ensure property belongs to the organization
    const property = organization.properties.find(p => p._id.toString() === propertyId);
    if (!property) {
      return res.status(404).json({ error: "Property not found in your organization." });
    }
    
    // Ensure the client is assigned (owner) of this property.
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

/**
 * ADMIN: Assign a Client to a Property
 */
router.post("/assign-client", async (req, res) => {
  try {
    const { propertyName, clientEmail } = req.body;
    
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can assign clients." });
    }
    
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }
    
    // Find the client in the same organization
    const client = await User.findOne({
      email: clientEmail,
      organizationId: req.user.organizationId,
      role: "client",
    });
    if (!client) {
      return res.status(404).json({ error: "No registered client with this email." });
    }
    
    // Find the property by name
    const property = organization.properties.find(p => p.name === propertyName);
    if (!property) {
      return res.status(404).json({ error: "Property not found in this organization." });
    }
    
    // Ensure clientOwners is an array
    if (!Array.isArray(property.clientOwners)) {
      property.clientOwners = [];
    }
    
    // Push the client's _id (ObjectId) if not already present
    if (!property.clientOwners.some(ownerId => ownerId.toString() === client._id.toString())) {
      property.clientOwners.push(client._id);
    }
    
    await organization.save();
    res.json({ message: `Client ${clientEmail} assigned to ${propertyName}` });
  } catch (error) {
    console.error("Error assigning client:", error);
    res.status(500).json({ error: "Server error assigning client." });
  }
});

/**
 * CLIENT: Fetch All Assigned Properties (Server-Side Filtering)
 */
router.get("/client-properties", async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Only clients can view properties." });
    }
    
    console.log("🔍 Client ID in Request:", req.user.id);
    
    const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
    // Use the correct client ID field from the JWT (ensure this matches your token payload)
    const userId = new mongoose.Types.ObjectId(req.user.id);
    
    // Log all organization properties before filtering
    const org = await Organization.findById(orgId);
    console.log("🏠 All Properties Before Filtering:", org.properties);
    
    // Use $ifNull to default missing clientOwners to an empty array
    const assignedProperties = await Organization.aggregate([
      { $match: { _id: orgId } },
      { $unwind: "$properties" },
      {
        $match: {
          $expr: {
            $in: [
              userId,
              { $ifNull: ["$properties.clientOwners", []] }
            ]
          }
        }
      },
      { $replaceRoot: { newRoot: "$properties" } }
    ]);
    
    console.log("🏠 Assigned Properties After Filtering:", assignedProperties);
    res.json(assignedProperties);
  } catch (error) {
    console.error("Error fetching client properties:", error);
    res.status(500).json({ error: "Server error fetching client properties." });
  }
});

module.exports = router;
