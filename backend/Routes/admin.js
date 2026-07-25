const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const User = require("../models/user");
const Submission = require("../models/submission");
const MileageTracking = require("../models/mileageTracking");
const Payment = require("../models/Payment");
const Organization = require("../models/organization");
const {
  getPaymentSummary,
  parsePaymentRates,
  calculatePaymentTotal,
} = require("../services/paymentSummary");
const { sendUserNotification } = require("../services/notifications");

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
    ).lean();

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    // Define the start of the current year (YTD calculation)
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Aggregate payments since the start of the year
    const paymentAgg = await Payment.aggregate([
      {
        $match: {
          userId: { $in: users.map((user) => user._id) },
          paidAt: { $gte: startOfYear },
        },
      },
      { $group: { _id: "$userId", total: { $sum: "$amount" } } },
    ]);

    // Map the aggregation results for easy lookup
    const ytdMap = {};
    paymentAgg.forEach((item) => {
      ytdMap[item._id.toString()] = item.total;
    });

    // Process each user: compute payment status and attach YTD total
    const usersWithStatus = users.map((user) => {
      const result = { ...user };
      if (user.lastPaidDate && new Date(user.lastPaidDate) >= startOfWeek) {
        result.status = "PAID";
      } else {
        result.status = "Awaiting Payment";
      }
      result.ytd = ytdMap[user._id.toString()] || 0;
      return result;
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
    const user = await User.findOne({
      _id: userId,
      organizationId: req.user.organizationId,
      role: "user",
    });
    if (!user) return res.status(404).json({ error: "User not found." });

    // Use submittedAt instead of createdAt
    const count = await Submission.countDocuments({
      organizationId: req.user.organizationId,
      userId,
      submittedAt: { $gt: user.lastPaidDate || new Date(0) },
    });

    res.json({ count });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Server error fetching submissions" });
  }
});

router.get("/payment-summary/:userId", async (req, res) => {
  try {
    const summary = await getPaymentSummary({
      organizationId: req.user.organizationId,
      userId: req.params.userId,
    });
    if (!summary) {
      return res.status(404).json({ error: "User not found in this organization." });
    }
    res.json(summary);
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    res.status(500).json({ error: "Unable to load payment summary." });
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
  let session;
  try {
    session = await mongoose.startSession();
    const { userId, allowSubmissionMismatch = false } = req.body;
    const rates = parsePaymentRates(req.body);
    if (!rates) {
      return res.status(400).json({ error: "Payment rates must be valid non-negative numbers." });
    }

    let processed;
    await session.withTransaction(async () => {
      const summary = await getPaymentSummary({
        organizationId: req.user.organizationId,
        userId,
        session,
      });
      if (!summary) {
        const error = new Error("User not found in this organization.");
        error.statusCode = 404;
        throw error;
      }
      if (summary.submissionCount > summary.assignmentCount && !allowSubmissionMismatch) {
        const error = new Error("Submissions exceed assignments. Confirmation is required.");
        error.statusCode = 409;
        error.code = "SUBMISSION_MISMATCH";
        error.summary = summary;
        throw error;
      }

      const totalPayment = calculatePaymentTotal(summary, rates);
      if (totalPayment <= 0) {
        const error = new Error("Payment total must be greater than zero.");
        error.statusCode = 400;
        throw error;
      }

      const paidAt = new Date();
      const userUpdate = await User.updateOne(
        {
          _id: userId,
          organizationId: req.user.organizationId,
          lastPaidDate: summary.lastPaidDate,
        },
        { $set: { lastPaidDate: paidAt } },
        { session }
      );
      if (userUpdate.modifiedCount !== 1) {
        const error = new Error("Payment data changed. Refresh and try again.");
        error.statusCode = 409;
        throw error;
      }

      const mileageRecord = await MileageTracking.findOne({
        userId,
        organizationId: req.user.organizationId,
      }).session(session);
      if (mileageRecord) {
        mileageRecord.history.push({
          paidDate: paidAt,
          milesPaid: summary.currentMiles,
          note: `Paid at $${rates.perMileRate}/mi + $${rates.perSubmissionRate}/submission`,
        });
        mileageRecord.totalMiles = 0;
        mileageRecord.lastUpdated = paidAt;
        await mileageRecord.save({ session });
      } else {
        await MileageTracking.create([{
          userId,
          organizationId: req.user.organizationId,
          totalMiles: 0,
          history: [{
            paidDate: paidAt,
            milesPaid: summary.currentMiles,
            note: "Initial payment with no prior mileage record",
          }],
        }], { session });
      }

      await Payment.create([{
        organizationId: req.user.organizationId,
        userId,
        amount: totalPayment,
        paidAt,
        milesPaid: summary.currentMiles,
        submissionsPaid: summary.submissionCount,
        assignmentsCount: summary.assignmentCount,
        perSubmissionRate: rates.perSubmissionRate,
        perMileRate: rates.perMileRate,
        processedBy: req.user.userId,
      }], { session });

      processed = { summary, totalPayment };
    });

    sendUserNotification({
      organizationId: req.user.organizationId,
      userId,
      type: "payment_processed",
      title: "Payment processed",
      body: `You've been paid $${processed.totalPayment.toFixed(2)} for your work.`,
      route: "/dashboard",
    }).catch((notificationError) => {
      console.error("Payment notification error:", notificationError);
    });

    res.json({
      success: true,
      message: "Payment logged and mileage reset.",
      totalPayment: processed.totalPayment,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        summary: error.summary,
      });
    }
    console.error("Error processing payment:", error);
    res.status(500).json({ error: "Server error processing payment" });
  } finally {
    if (session) await session.endSession();
  }
});

router.post("/legacy-process-payment-disabled", async (req, res) => {
  return res.status(410).json({ error: "This payment endpoint has been retired." });
  /* istanbul ignore next */
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
      mileageRecord.history.push({
        paidDate: new Date(),
        milesPaid: mileage,
        note: `Paid at $${perMileRate}/mi + $${perSubmissionRate}/submission`,
      });

      mileageRecord.totalMiles = 0;
      mileageRecord.lastUpdated = new Date();
      await mileageRecord.save();
    } else {
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
    if (totalPayment > 0) {
      await Payment.create({
        userId,
        amount: totalPayment,
        paidAt: new Date(),
        milesPaid: mileage,
        submissionsPaid: submissions,
      });
    }

    // 4) **Send Push Notification** if the user has a registered device token
    const user = await User.findById(userId);
    if (user && user.deviceToken) {
      const message = `💰 Payment Processed: You’ve been paid $${totalPayment.toFixed(2)} for your work!`;
      sendPushNotification(user.deviceToken, message);
    }

    res.json({ success: true, message: "Payment logged & mileage reset!" });
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({ error: "Server error processing payment" });
  }
});

// routes/admin.js (or a dedicated route file)
router.post("/assign-client-to-property", async (req, res) => {
  try {
    // Ensure only admins can do this
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can assign clients to properties." });
    }

    const { propertyName, clientEmail } = req.body;
    if (!propertyName || !clientEmail) {
      return res.status(400).json({ error: "propertyName and clientEmail are required." });
    }

    // Convert email to lowercase
    const lowerEmail = clientEmail.trim().toLowerCase();

    // Find the client user
    const clientUser = await User.findOne({
      email: lowerEmail,
      role: "client",
      organizationId: req.user.organizationId,
    });
    if (!clientUser) {
      return res.status(404).json({ error: "Client user not found in this organization." });
    }

    // Find the organization & property
    const org = await Organization.findById(req.user.organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found." });
    }

    // Find the property by name (or ID if you prefer)
    const property = org.properties.find(p => p.name === propertyName);
    if (!property) {
      return res.status(404).json({ error: "Property not found." });
    }

    // Initialize clientOwners if needed
    if (!property.clientOwners) {
      property.clientOwners = [];
    }

    // Check if this client is already assigned
    const alreadyAssigned = property.clientOwners.some(ownerId => ownerId.equals(clientUser._id));
    if (alreadyAssigned) {
      return res.status(400).json({ error: "This client is already assigned to the property." });
    }

    // Assign the client to the property
    property.clientOwners.push(clientUser._id);
    await org.save();

    res.json({ success: true, message: "Client assigned successfully!" });
  } catch (error) {
    console.error("Error assigning client:", error);
    res.status(500).json({ error: "Server error assigning client." });
  }
});

module.exports = router;
