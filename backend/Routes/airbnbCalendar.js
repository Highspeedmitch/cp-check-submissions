const express = require("express");
const router = express.Router();
const ical = require("node-ical");
const authenticateToken = require("../middleware/authenticateToken");

// ✅ GET Airbnb iCal Data for a Property
router.get("/:propertyId", authenticateToken, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const airbnbIcalUrl = `https://www.airbnb.com/calendar/ical/${propertyId}.ics`; // Replace with actual URL structure

    console.log("🔍 Fetching iCal data from:", airbnbIcalUrl);
    
    const data = await ical.fromURL(airbnbIcalUrl);
    
    const events = Object.values(data)
      .filter(event => event.type === "VEVENT")
      .map(event => ({
        title: "Airbnb Booking",
        start: new Date(event.start),
        end: new Date(event.end),
        allDay: true,
      }));

    console.log("📅 Airbnb Bookings:", events);
    res.json(events);
  } catch (error) {
    console.error("❌ Error fetching Airbnb iCal data:", error);
    res.status(500).json({ error: "Failed to fetch Airbnb calendar." });
  }
});

module.exports = router;
