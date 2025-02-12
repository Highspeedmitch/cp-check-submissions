const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Assignment = require("../models/assignment");
const { sendPushNotification } = require("./admin"); // Import push function

// ========================================
// 📌 POST /admin/create-assignment
// - Create a new assignment & notify the user
// ========================================
router.post("/create-assignment", async (req, res) => {
  try {
    const { userId, propertyId, dueDate } = req.body;

    // 1️⃣ Create the new assignment
    const newAssignment = await Assignment.create({
      userId,
      propertyId,
      dueDate,
      createdAt: new Date(),
    });

    // 2️⃣ Fetch the assigned user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 3️⃣ **Check if user has a registered push token**
    if (user.deviceToken) {
      const message = `📌 New Assignment: You have a new task for property ${propertyId}. Check your dashboard!`;
      sendPushNotification(user.deviceToken, message);
    }

    res.json({ success: true, assignment: newAssignment });
  } catch (error) {
    console.error("Error creating assignment:", error);
    res.status(500).json({ error: "Server error creating assignment" });
  }
});

module.exports = router;

// GET /api/assignments/count/:userId
// Returns the number of assignments for the user since lastPaidDate
router.get("/assignments/count/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: "User not found." });
      
      const sinceDate = user.lastPaidDate || new Date(0);
      // Count assignments with startDate >= lastPaidDate (or some other filter logic)
      const count = await Assignment.countDocuments({
        userId,
        startDate: { $gte: sinceDate },
      });
      
      res.json({ count });
    } catch (error) {
      console.error("Error fetching assignment count:", error);
      res.status(500).json({ error: "Server error fetching assignment count" });
    }
  });
  