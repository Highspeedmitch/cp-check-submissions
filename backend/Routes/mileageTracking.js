const express = require("express");
const router = express.Router();
const MileageTracking = require("../models/mileageTracking");

// ✅ Start or Resume Tracking (Called when the user enables the toggle)
router.post("/start", async (req, res) => {
  try {
    const mileageRecord = await MileageTracking.findOneAndUpdate(
      {
        userId: req.user.userId,
        organizationId: req.user.organizationId,
      },
      {
        $setOnInsert: {
          userId: req.user.userId,
          organizationId: req.user.organizationId,
          totalMiles: 0,
        },
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: "Mileage tracking started/resumed.", mileageRecord });
  } catch (error) {
    console.error("Error starting mileage tracking:", error);
    res.status(500).json({ error: "Server error starting mileage tracking" });
  }
});

// ✅ Update Mileage (Every 30s)
router.post("/update", async (req, res) => {
    try {
      const miles = Number(req.body.miles);
      if (!Number.isFinite(miles) || miles < 0 || miles > 100) {
        return res.status(400).json({ error: "Enter a valid mileage increment." });
      }

      const mileageRecord = await MileageTracking.findOneAndUpdate(
        {
          userId: req.user.userId,
          organizationId: req.user.organizationId,
        },
        {
          $inc: { totalMiles: miles },
          $set: { lastUpdated: new Date() },
        },
        { new: true }
      );
      if (!mileageRecord) {
        return res.status(404).json({ error: "Mileage record not found." });
      }
  
      res.json({ success: true, totalMiles: mileageRecord.totalMiles });
    } catch (error) {
      console.error("Error updating mileage:", error);
      res.status(500).json({ error: "Server error updating mileage" });
    }
  });
  

module.exports = router;
