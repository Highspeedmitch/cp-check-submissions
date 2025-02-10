const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Submission = require("../models/submission");
const MileageTracking = require("../models/mileageTracking");

// ✅ Get all users & their payment status
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, "username _id lastPaidDate");

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Set to Sunday

    users.forEach((user) => {
      user.status =
        user.lastPaidDate && new Date(user.lastPaidDate) >= startOfWeek
          ? "PAID"
          : "Awaiting Payment";
    });

    res.json(users);
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

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const submissions = await Submission.find({
      userId,
      createdAt: { $gt: user.lastPaidDate || new Date(0) }, // Only new submissions
    });

    res.json({ count: submissions.length });
  } catch (error) {
    console.error("Error fetching user submissions:", error);
    res.status(500).json({ error: "Server error fetching user submissions" });
  }
});

// ✅ Process Payment & Reset Data
router.post("/process-payment", async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findByIdAndUpdate(userId, {
      lastPaidDate: new Date(), // Update last payment date
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    await MileageTracking.findOneAndUpdate(
      { userId },
      { totalMiles: 0 } // Reset mileage after payment
    );

    res.json({ success: true, message: "Payment logged & data reset!" });
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({ error: "Server error processing payment" });
  }
});

module.exports = router;
