// routes/contractors.js
const express = require("express");
const router = express.Router();
const Contractor = require("../models/contractor");
const authenticateToken = require("../middleware/authenticateToken");

// ✅ Admins can add contractors
router.post("/", authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== "admin") {
      return res.status(403).json({ error: "Only admins can add contractors." });
    }

    const { name, email, organizationId } = req.body;
    const newContractor = new Contractor({ name, email, organizationId });
    await newContractor.save();

    res.status(201).json({ message: "Contractor added successfully.", contractor: newContractor });
  } catch (err) {
    console.error("Error adding contractor:", err);
    res.status(500).json({ error: "Server error adding contractor" });
  }
});

// ✅ Get contractors for an organization
router.get("/:organizationId", authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== "admin") {
      return res.status(403).json({ error: "Only admins can view contractors." });
    }

    const contractors = await Contractor.find({ organizationId: req.params.organizationId });
    res.json(contractors);
  } catch (err) {
    console.error("Error fetching contractors:", err);
    res.status(500).json({ error: "Server error fetching contractors" });
  }
});

module.exports = router;
