const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Submission = require("../models/submission");
const MileageTracking = require("../models/mileageTracking");
const Payment = require("../models/Payment");

// ✅ Get all users & their payment status
router.get("/users", authenticateToken, async (req, res) => {
    try {
      const adminOrgId = req.user.organizationId;
      // Get only non-admin users from the admin's organization
      const users = await User.find(
        { organizationId: adminOrgId, role: "user" },
        "username _id lastPaidDate"
      );
  
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      // Define the start of the current year (YTD calculation)
      const startOfYear = new Date(today.getFullYear(), 0, 1);
  
      // Aggregate payments since the start of the year
      const paymentAgg = await Payment.aggregate([
        { $match: { paidAt: { $gte: startOfYear } } },
        { $group: { _id: "$userId", total: { $sum: "$amount" } } }
      ]);
  
      // Map the aggregation results for easy lookup
      const ytdMap = {};
      paymentAgg.forEach((item) => {
        ytdMap[item._id.toString()] = item.total;
      });
  
      // Process each user: compute payment status and attach YTD total
      const usersWithStatus = users.map((user) => {
        if (user.lastPaidDate && new Date(user.lastPaidDate) >= startOfWeek) {
          user.status = "PAID";
        } else {
          user.status = "Awaiting Payment";
        }
        user.ytd = ytdMap[user._id.toString()] || 0;
        return user;
      });
  
      res.json(usersWithStatus);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Server error fetching users" });
    }
  });  

    // ✅ Get user's submissions since last payment
    router.get("/user-submissions/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: "User not found." });
  
      // Use submittedAt instead of createdAt
      const submissions = await Submission.find({
        userId,
        submittedAt: { $gt: user.lastPaidDate || new Date(0) },
      });
  
      res.json({ count: submissions.length });
    } catch (error) {
      console.error("Error fetching submissions:", error);
      res.status(500).json({ error: "Server error fetching submissions" });
    }
  });  
  
// Process Payment & Reset Data
router.post("/process-payment", async (req, res) => {
    try {
      const { userId, totalPayment } = req.body;
  
      // Update the user's last payment date
      await User.findByIdAndUpdate(userId, {
        lastPaidDate: new Date()
      });
  
      // Reset the user's mileage tracking record
      await MileageTracking.findOneAndUpdate(
        { userId },
        { totalMiles: 0 }
      );
  
      // Create a new Payment record if totalPayment is positive
      if (totalPayment > 0) {
        await Payment.create({
          userId,
          amount: totalPayment
        });
      }
  
      res.json({ success: true, message: "Payment logged & data reset!" });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ error: "Server error processing payment" });
    }
  });
  
  module.exports = router;
