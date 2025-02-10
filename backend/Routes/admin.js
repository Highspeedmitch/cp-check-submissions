const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Submission = require("../models/submission");
const MileageTracking = require("../models/mileageTracking");
const authenticateToken = require("../middleware/authenticateToken");

// ✅ Get all users & their payment status
router.get("/users", authenticateToken, async (req, res) => {
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
});

// ✅ Get user's submissions since last payment
router.get("/user-submissions/:userId", authenticateToken, async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);

  const submissions = await Submission.find({
    userId,
    createdAt: { $gt: user.lastPaidDate || new Date(0) }, // Only new submissions
  });

  res.json({ count: submissions.length });
});

// ✅ Process Payment & Reset Data
router.post("/process-payment", authenticateToken, async (req, res) => {
  const { userId } = req.body;

  await User.findByIdAndUpdate(userId, {
    lastPaidDate: new Date(), // Update last payment date
  });

  await MileageTracking.findOneAndUpdate(
    { userId },
    { totalMiles: 0 } // Reset mileage after payment
  );

  res.json({ success: true, message: "Payment logged & data reset!" });
});

module.exports = router;
