const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Contractor = require("../models/contractor");
const Cleaner = require("../models/cleaner"); // 🔹 Add a Cleaner model if needed
const Assignment = require("../models/assignment");
const authenticateToken = require("../middleware/authenticateToken");

// ========================================
// 📌 POST /api/azroots-assignments
// - Create an assignment specific to AzRoots
// ========================================
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { organizationId, propertyName, userId, eventType, startDate, endDate, oneTimeCheckRequest } = req.body;

    // 🔹 Ensure only admins from AzRoots can create assignments
    if (req.user.role !== "admin" || req.user.organizationId !== organizationId) {
      return res.status(403).json({ error: "Unauthorized. Admins only." });
    }

    // 🔹 Validate eventType for AzRoots (QA Check, Maintenance, Cleaning)
    const validEventTypes = ["QA Check", "Maintenance", "Cleaning"];
    if (!validEventTypes.includes(eventType)) {
      return res.status(400).json({ error: "Invalid event type for AzRoots." });
    }

    // 🔹 Validate assigned user based on eventType
    let assignedEntity;
    if (eventType === "QA Check") {
      assignedEntity = await User.findById(userId);
    } else if (eventType === "Maintenance") {
      assignedEntity = await Contractor.findById(userId);
    } else if (eventType === "Cleaning") {
      assignedEntity = await Cleaner.findById(userId);
    }

    if (!assignedEntity) {
      return res.status(404).json({ error: `User not found for ${eventType}.` });
    }

    // ✅ Prevent duplicate assignments
    const overlapping = await Assignment.findOne({
      organizationId,
      propertyName,
      startDate: { $lte: new Date(endDate) },
      endDate: { $gte: new Date(startDate) },
    });

    if (overlapping) {
      return res.status(400).json({ error: "Overlapping assignment exists for this property." });
    }

    // ✅ Create and save the assignment
    const assignment = new Assignment({
      organizationId,
      propertyName,
      userId: assignedEntity._id,
      eventType,
      startDate,
      endDate,
      oneTimeCheckRequest,
    });

    await assignment.save();
    res.status(201).json({ success: true, message: "AzRoots Assignment created successfully", assignment });

  } catch (error) {
    console.error("❌ Error creating AzRoots assignment:", error);
    res.status(500).json({ error: "Server error creating AzRoots assignment." });
  }
});

module.exports = router;
