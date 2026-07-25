const express = require("express");
const router = express.Router();
const MileageTracking = require("../models/mileageTracking");
const User = require("../models/user"); // ✅ Import User model

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
  

// ✅ Get User's Mileage for Admin
// GET /api/mileage/user/:userId
// Return { totalMiles, ytdMiles } so the admin page can display both
router.get("/user/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      if (req.user.role !== "admin" && req.user.userId.toString() !== userId) {
        return res.status(403).json({ error: "You cannot view another user's mileage." });
      }
      const user = await User.findOne({
        _id: userId,
        organizationId: req.user.organizationId,
      }).select("_id").lean();
      if (!user) {
        return res.status(404).json({ error: "User not found in this organization." });
      }
      const currentYear = new Date().getFullYear();
  
      const record = await MileageTracking.findOne({
        userId,
        organizationId: req.user.organizationId,
      }).lean();
      if (!record) {
        return res.json({ totalMiles: 0, ytdMiles: 0 });
      }
  
      // totalMiles is what's accumulated since last payment
      const totalMiles = record.totalMiles;
  
      // Summation of all milesPaid in `history` for the current year
      let ytdMiles = 0;
      for (const entry of record.history) {
        const yr = new Date(entry.paidDate).getFullYear();
        if (yr === currentYear) {
          ytdMiles += entry.milesPaid;
        }
      }
  
      res.json({ totalMiles, ytdMiles });
    } catch (err) {
      console.error("Error in GET mileage:", err);
      res.status(500).json({ error: "Server error fetching mileage" });
    }
  });  

module.exports = router;
