const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Submission = require("../models/submission");
const MileageTracking = require("../models/mileageTracking");
const Payment = require("../models/Payment");
const apn = require('apn');
const ical = require("node-ical");

const apnProvider = new apn.Provider({
  token: {
      key: Buffer.from(process.env.APN_PRIVATE_KEY, 'base64').toString('utf8'), // ❌ Bad practice
      keyId: process.env.APN_KEY_ID,
      teamId: process.env.APN_TEAM_ID,
  },
  production: process.env.NODE_ENV === "production",
});

async function sendPushNotification(deviceToken, message) {
  let note = new apn.Notification();
  note.alert = message;
  note.topic = process.env.APN_BUNDLE_ID;

  try {
    const result = await apnProvider.send(note, deviceToken);
    console.log("APN Response:", result);
  } catch (err) {
    console.error("APN Error:", err);
  }
}

module.exports = { sendPushNotification };

// ========================================
// 1) GET /admin/users
//    - Return all "user" (non-admin) accounts in the same org
//    - Attach a YTD total for $ amounts from Payment
//    - Determine if they've been paid this week
// ========================================
router.get("/users", async (req, res) => {
  try {
    const adminOrgId = req.user.organizationId;
    const { eventType } = req.query; // ✅ Get event type filter from request

    // ✅ Determine allowed roles based on eventType
    let allowedRoles = ["user"]; // Default (QA Check)
    if (eventType === "Maintenance") allowedRoles = ["contractor"];
    if (eventType === "Cleaning") allowedRoles = ["cleaner"];

    console.log("🔹 Fetching users for event type:", eventType, "Allowed roles:", allowedRoles);

    // ✅ Get users from admin's organization & filter by role
    const users = await User.find(
      { organizationId: adminOrgId, role: { $in: allowedRoles } },
      "username _id lastPaidDate role"
    );

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    // ✅ Define the start of the current year (YTD calculation)
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // ✅ Aggregate payments since the start of the year
    const paymentAgg = await Payment.aggregate([
      { $match: { paidAt: { $gte: startOfYear } } },
      { $group: { _id: "$userId", total: { $sum: "$amount" } } },
    ]);

    // ✅ Map payment aggregation results for easy lookup
    const ytdMap = {};
    paymentAgg.forEach((item) => {
      ytdMap[item._id.toString()] = item.total;
    });

    // ✅ Process each user: compute payment status and attach YTD total
    const usersWithStatus = users.map((user) => {
      user.status =
        user.lastPaidDate && new Date(user.lastPaidDate) >= startOfWeek
          ? "PAID"
          : "Awaiting Payment";
      user.ytd = ytdMap[user._id.toString()] || 0;
      return user;
    });

    res.json(usersWithStatus);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
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

// ✅ Fetch & Parse Airbnb `.ics` Calendar
router.get("/airbnb-calendar/:propertyId", async (req, res) => {
  try {
    const { propertyId } = req.params;

    // ✅ Find Property & Get `.ics` URL
    const organization = await Organization.findOne({ "properties._id": propertyId }, { "properties.$": 1 });
    if (!organization) return res.status(404).json({ error: "Property not found" });

    const property = organization.properties[0];
    if (!property.airbnbCalendarUrl) return res.status(400).json({ error: "No Airbnb calendar URL found" });

    console.log("🔹 Fetching Airbnb `.ics` from:", property.airbnbCalendarUrl);

    // ✅ Fetch & Parse `.ics` Data
    const events = await ical.fromURL(property.airbnbCalendarUrl);
    const parsedEvents = Object.values(events)
      .filter((event) => event.type === "VEVENT")
      .map((event) => ({
        title: "Airbnb Booking",
        start: event.start,
        end: event.end,
      }));

    res.json(parsedEvents);
  } catch (error) {
    console.error("❌ Error fetching Airbnb calendar:", error);
    res.status(500).json({ error: "Server error fetching Airbnb calendar" });
  }
});

module.exports = router;
