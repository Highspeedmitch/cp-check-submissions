const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/authenticateToken");
const Communication = require("../models/communication"); // Ensure this model exists
const Organization = require("../models/organization");

// ✅ Get communications for clients
router.get("/client/communications", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Only clients can view communications." });
    }

    // Ensure the user belongs to AzRoots
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization || organization.name !== "AzRoots") {
      return res.status(403).json({ error: "Only AzRoots clients can view communications." });
    }

    // Fetch communications for the client's organization
    const communications = await Communication.find({ organizationId: req.user.organizationId })
      .sort({ createdAt: -1 }) // Sort by most recent first
      .limit(10);

    res.json(communications);
  } catch (error) {
    console.error("Error fetching client communications:", error);
    res.status(500).json({ error: "Server error fetching communications." });
  }
});

module.exports = router;
