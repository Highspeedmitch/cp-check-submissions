const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Submission = require("../models/submission");
const MileageTracking = require("../models/mileageTracking");
const Payment = require("../models/Payment");

// ========================================
// 1) GET /admin/users
//    - Return all "user" (non-admin) accounts in the same org
//    - Attach a YTD total for $ amounts from Payment
//    - Determine if they've been paid this week
// ========================================
router.get("/users", async (req, res) => {
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
      { $group: { _id: "$userId", total: { $sum: "$amount" } } },
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

// ========================================
// 2) GET /admin/user-submissions/:userId
//    - Count how many submissions they've made since lastPaidDate
// ========================================
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

// ========================================
// 3) POST /admin/process-payment
//    - Log a payment for the user
//    - Reset their mileage in MileageTracking
//    - Optionally push a record to the mileageTracking.history
//    - Create a Payment entry
// ========================================
router.post("/process-payment", async (req, res) => {
  try {
    const {
      userId,
      totalPayment,
      submissions,
      mileage,
      perSubmissionRate,
      perMileRate,
    } = req.body;

    // 1) Update the user's last payment date
    await User.findByIdAndUpdate(userId, {
      lastPaidDate: new Date(),
    });

    // 2) Find the existing mileage doc for this user
    const mileageRecord = await MileageTracking.findOne({ userId });
    if (mileageRecord) {
      // Add an entry to history
      mileageRecord.history.push({
        paidDate: new Date(),
        milesPaid: mileage,
        note: `Paid at $${perMileRate}/mi + $${perSubmissionRate}/submission`,
      });

      // Reset totalMiles
      mileageRecord.totalMiles = 0;
      mileageRecord.lastUpdated = new Date();
      await mileageRecord.save();
    } else {
      // No mileage record found, optionally create one if needed
      // (If you want to store the newly paid miles anyway)
      await MileageTracking.create({
        userId,
        organizationId: req.user.organizationId,
        totalMiles: 0,
        history: [
          {
            paidDate: new Date(),
            milesPaid: mileage,
            note: "Initial payment with no prior record",
          },
        ],
      });
    }

    // 3) Create a new Payment record if totalPayment is positive
    //    Payment model might optionally store "miles" or "submissions" etc.
    if (totalPayment > 0) {
      await Payment.create({
        userId,
        amount: totalPayment,
        paidAt: new Date(),
        // Optionally store these details:
        milesPaid: mileage,
        submissionsPaid: submissions,
      });
    }

    res.json({ success: true, message: "Payment logged & mileage reset!" });
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({ error: "Server error processing payment" });
  }
});

module.exports = router;
