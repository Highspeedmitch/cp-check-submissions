const express = require("express");
const router = express.Router();
const MileageTracking = require("../models/mileageTracking");
const User = require("../models/user"); // ✅ Import User model
const authenticateToken = require("../middleware/authenticateToken");

// ✅ Start or Resume Tracking (Called when the user enables the toggle)
router.post("/start", authenticateToken, async (req, res) => {
  try {
    const { userId, organizationId } = req.user; // Extract user info from token

    let mileageRecord = await MileageTracking.findOne({ userId });

    if (!mileageRecord) {
      mileageRecord = new MileageTracking({ userId, organizationId, totalMiles: 0 });
    }

    await mileageRecord.save();
    res.json({ success: true, message: "Mileage tracking started/resumed.", mileageRecord });
  } catch (error) {
    console.error("Error starting mileage tracking:", error);
    res.status(500).json({ error: "Server error starting mileage tracking" });
  }
});

// ✅ Update Mileage (Every 30s)
router.post("/update", authenticateToken, async (req, res) => {
    try {
      const { userId } = req.user;
      const { miles } = req.body; 
  
      let user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }
  
      user.totalMiles += miles;
      await user.save();
  
      res.json({ success: true, totalMiles: user.totalMiles });
    } catch (error) {
      console.error("Error updating mileage:", error);
      res.status(500).json({ error: "Server error updating mileage" });
    }
  });
  
  // ✅ Get User's Mileage for Admin
  router.get("/user/:userId", authenticateToken, async (req, res) => {
    try {
      const { userId } = req.params;
  
      const user = await User.findById(userId);
      if (!user) {
        return res.json({ success: true, totalMiles: 0 }); 
      }
  
      res.json({ success: true, totalMiles: user.totalMiles });
    } catch (error) {
      console.error("Error fetching mileage data:", error);
      res.status(500).json({ error: "Server error fetching mileage" });
    }
  });
  
  module.exports = router;
  
