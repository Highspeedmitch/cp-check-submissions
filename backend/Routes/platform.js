const express = require("express");
const User = require("../models/user");
const Organization = require("../models/organization");
const PlatformSession = require("../models/platformSession");
const authenticateToken = require("../middleware/authenticateToken");
const requirePlatformAdmin = require("../middleware/requirePlatformAdmin");
const { authResponse } = require("../services/authSessions");
const {
  ASSUMED_ACCESS_MS,
  createAssumedAccessResponse,
} = require("../services/platformAccess");
const { getPlatformOrganizationMetrics } = require("../services/platformMetrics");

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || "supersecuresecret";

router.get("/organizations", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    return res.json(await getPlatformOrganizationMetrics());
  } catch (error) {
    console.error("Platform metrics error:", error);
    return res.status(500).json({ error: "Unable to load platform metrics." });
  }
});

router.post("/organizations/:organizationId/assume", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const reason = String(req.body.reason || "").trim();
    if (!reason) return res.status(400).json({ error: "A reason is required." });
    if (reason.length > 200) return res.status(400).json({ error: "Reason must be 200 characters or fewer." });

    const [user, organization] = await Promise.all([
      User.findById(req.user.userId),
      Organization.findById(req.params.organizationId).select("name orgType"),
    ]);
    if (!user || user.platformRole !== "platform_admin") {
      return res.status(403).json({ error: "Platform administrator access required." });
    }
    if (!organization) return res.status(404).json({ error: "Organization not found." });

    const expiresAt = new Date(Date.now() + ASSUMED_ACCESS_MS);
    const platformSession = await PlatformSession.create({
      platformAdminId: user._id,
      organizationId: organization._id,
      reason,
      expiresAt,
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
    return res.json(createAssumedAccessResponse({
      user,
      organization,
      platformSessionId: platformSession._id,
      secretKey: SECRET_KEY,
    }));
  } catch (error) {
    console.error("Organization assumption error:", error);
    return res.status(500).json({ error: "Unable to enter the organization." });
  }
});

router.post("/exit", authenticateToken, async (req, res) => {
  if (!req.user.assumedOrganization || req.user.platformRole !== "platform_admin") {
    return res.status(400).json({ error: "No assumed organization session is active." });
  }
  try {
    await PlatformSession.updateOne(
      {
        _id: req.user.platformSessionId,
        platformAdminId: req.user.userId,
        endedAt: null,
      },
      { $set: { endedAt: new Date() } }
    );
    const user = await User.findById(req.user.userId).populate("organizationId");
    if (!user?.organizationId) {
      return res.status(500).json({ error: "Unable to restore the platform account." });
    }
    return res.json(authResponse(user, SECRET_KEY));
  } catch (error) {
    console.error("Organization assumption exit error:", error);
    return res.status(500).json({ error: "Unable to exit the organization." });
  }
});

module.exports = router;
