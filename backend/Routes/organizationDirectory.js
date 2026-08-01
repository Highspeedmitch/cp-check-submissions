const express = require("express");
const User = require("../models/user");

const router = express.Router();

router.get("/org-admins", async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ error: "Forbidden - Clients only" });
    }
    const admins = await User.find({
      organizationId: req.user.organizationId,
      role: "admin",
    }).select("_id email");
    return res.json(admins);
  } catch (error) {
    console.error("Error fetching organization admins:", error);
    return res.status(500).json({ error: "Server error fetching organization admins" });
  }
});

module.exports = router;
