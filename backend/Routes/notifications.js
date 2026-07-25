const express = require("express");
const PushToken = require("../models/PushToken");
const WebPushSubscription = require("../models/webPushSubscription");
const Notification = require("../models/notification");

const router = express.Router();
const PLATFORMS = ["ios", "android", "web"];

router.get("/web-push-key", (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: "Web Push is not configured." });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post("/web-subscriptions", async (req, res) => {
  try {
    const subscription = req.body.subscription || {};
    const endpoint = String(subscription.endpoint || "").trim();
    const p256dh = String(subscription.keys?.p256dh || "").trim();
    const auth = String(subscription.keys?.auth || "").trim();
    const deviceId = String(req.body.deviceId || "").trim();
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "A valid Web Push subscription is required." });
    }

    const saved = await WebPushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          userId: req.user.userId,
          organizationId: req.user.organizationId,
          keys: { p256dh, auth },
          deviceId,
          enabled: true,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ success: true, subscriptionId: saved._id });
  } catch (error) {
    console.error("Web Push subscription error:", error);
    res.status(500).json({ error: "Unable to register Web Push." });
  }
});

router.delete("/web-subscriptions", async (req, res) => {
  try {
    const endpoint = String(req.body.endpoint || "").trim();
    if (!endpoint) return res.status(400).json({ error: "An endpoint is required." });
    await WebPushSubscription.updateOne(
      {
        endpoint,
        userId: req.user.userId,
        organizationId: req.user.organizationId,
      },
      { $set: { enabled: false } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Unable to unregister Web Push." });
  }
});

router.post("/devices", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const platform = String(req.body.platform || "").toLowerCase();
    const deviceId = String(req.body.deviceId || "").trim();
    if (!token || !PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: "A valid token and platform are required." });
    }

    const device = await PushToken.findOneAndUpdate(
      { token },
      {
        $set: {
          userId: req.user.userId,
          organizationId: req.user.organizationId,
          platform,
          deviceId,
          enabled: true,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ success: true, deviceId: device._id });
  } catch (error) {
    console.error("Notification device registration error:", error);
    res.status(500).json({ error: "Unable to register this device." });
  }
});

router.delete("/devices", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    if (!token) return res.status(400).json({ error: "A token is required." });
    await PushToken.updateOne(
      { token, userId: req.user.userId, organizationId: req.user.organizationId },
      { $set: { enabled: false } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Unable to unregister this device." });
  }
});

router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.user.userId,
      organizationId: req.user.organizationId,
    }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: "Unable to load notifications." });
  }
});

router.put("/:notificationId/read", async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        userId: req.user.userId,
        organizationId: req.user.organizationId,
      },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: "Notification not found." });
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: "Unable to update notification." });
  }
});

module.exports = router;
