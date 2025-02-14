
// routes/assignments.js
const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Contractor = require("../models/contractor");
const Assignment = require("../models/assignment");
const authenticateToken = require("../middleware/authenticateToken");

// ========================================
// 📌 POST /admin/create-assignment
// - Create an assignment based on event type (Regular Check or Maintenance)
// ========================================
router.post("/create-assignment", authenticateToken, async (req, res) => {
  try {
    const { eventType, propertyId, assignedId, startDate, endDate } = req.body;

    // Ensure only admins can create assignments
    if (req.user.userType !== "admin") {
      return res.status(403).json({ error: "Only admins can create assignments." });
    }

    // Validate event type
    if (!["Regular Check", "Maintenance"].includes(eventType)) {
      return res.status(400).json({ error: "Invalid event type." });
    }

    // Check if assigning a user (Regular Check) or contractor (Maintenance)
    let assignedEntity;
    if (eventType === "Regular Check") {
      assignedEntity = await User.findById(assignedId);
      if (!assignedEntity) {
        return res.status(404).json({ error: "User not found for Regular Check." });
      }
    } else if (eventType === "Maintenance") {
      assignedEntity = await Contractor.findById(assignedId);
      if (!assignedEntity) {
        return res.status(404).json({ error: "Contractor not found for Maintenance." });
      }
    }

    // ✅ Prevent duplicate assignments for the same property & timeframe
    const overlapping = await Assignment.findOne({
      propertyId,
      startDate: { $lte: new Date(endDate) },
      endDate: { $gte: new Date(startDate) },
    });

    if (overlapping) {
      return res.status(400).json({ error: "Overlapping assignment exists for this property." });
    }

    // ✅ Create and save the assignment
    const assignment = new Assignment({
      propertyId,
      userId: eventType === "Regular Check" ? assignedEntity._id : null, // Only set for Regular Checks
      contractorId: eventType === "Maintenance" ? assignedEntity._id : null, // Only set for Maintenance
      organizationId: req.user.organizationId,
      startDate,
      endDate,
      eventType,
    });

    await assignment.save();

    res.json({ success: true, message: "Assignment created successfully", assignment });

  } catch (error) {
    console.error("❌ Error creating assignment:", error);
    res.status(500).json({ error: "Server error creating assignment." });
  }
});

// ========================================
// 📌 GET /admin/assignments
// - Fetch assignments, conditionally showing users vs. contractors
// ========================================
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Ensure only admins can fetch assignments
    if (req.user.userType !== "admin") {
      return res.status(403).json({ error: "Only admins can view assignments." });
    }

    // Fetch assignments with user or contractor data populated
    const assignments = await Assignment.find({ organizationId: req.user.organizationId })
      .populate("userId", "username email") // Populate user if assigned
      .populate("contractorId", "name email"); // Populate contractor if assigned

    res.json(assignments);

  } catch (error) {
    console.error("❌ Error fetching assignments:", error);
    res.status(500).json({ error: "Server error fetching assignments." });
  }
});

module.exports = router;
