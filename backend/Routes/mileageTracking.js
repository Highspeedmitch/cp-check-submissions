const express = require("express");
const router = express.Router();
const MileageTracking = require("../models/mileageTracking");
const User = require("../models/user"); // ✅ Import User model

// ✅ Start or Resume Tracking (Called when the user enables the toggle)
router.post("/start", async (req, res) => {
  try {
    const { userId, organizationId } = req.body; // Extract user info from request body

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
router.post("/update", async (req, res) => {
    try {
      const { userId, miles } = req.body; 
  
      // Find the MileageTracking document for the user
      let mileageRecord = await MileageTracking.findOne({ userId });
      if (!mileageRecord) {
        return res.status(404).json({ error: "Mileage record not found." });
      }
  
      // Update the mileage record rather than the User model
      mileageRecord.totalMiles += miles;
      mileageRecord.lastUpdated = new Date();
      await mileageRecord.save();
  
      res.json({ success: true, totalMiles: mileageRecord.totalMiles });
    } catch (error) {
      console.error("Error updating mileage:", error);
      res.status(500).json({ error: "Server error updating mileage" });
    }
  });
  

// ✅ Get User's Mileage for Admin
router.get("/user/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const mileageRecord = await MileageTracking.findOne({ userId });
      if (!mileageRecord) {
        return res.json({ success: true, totalMiles: 0 });
      }
      res.json({ success: true, totalMiles: mileageRecord.totalMiles });
    } catch (error) {
      console.error("Error fetching mileage data:", error);
      res.status(500).json({ error: "Server error fetching mileage" });
    }
  });
  

module.exports = router;
