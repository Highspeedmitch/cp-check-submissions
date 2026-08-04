const express = require("express");
const CalendarFeedSubscription = require("../models/calendarFeedSubscription");
const {
  calendarForToken,
  createFeedCredential,
  privateFeedPath,
} = require("../services/calendarFeed");

function createCalendarFeedHandlers({
  SubscriptionModel = CalendarFeedSubscription,
  calendarForCredential = calendarForToken,
  createCredential = createFeedCredential,
} = {}) {
  async function status(req, res) {
    try {
      const subscription = await SubscriptionModel.findOne({
        userId: req.user.userId,
        active: true,
      }).select("generatedAt lastAccessedAt").lean();
      return res.json({
        connected: Boolean(subscription),
        generatedAt: subscription?.generatedAt || null,
        lastAccessedAt: subscription?.lastAccessedAt || null,
      });
    } catch (error) {
      console.error("Calendar feed status error:", error);
      return res.status(500).json({ error: "Could not load calendar connection status." });
    }
  }

  async function generate(req, res) {
    try {
      const { token, subscription } = await createCredential(req.user.userId, {
        SubscriptionModel,
      });
      return res.status(201).json({
        connected: true,
        generatedAt: subscription.generatedAt,
        subscriptionPath: privateFeedPath(token),
      });
    } catch (error) {
      console.error("Calendar feed generation error:", error.status ? error.message : error);
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Could not create calendar connection.",
      });
    }
  }

  async function rotate(req, res) {
    try {
      const { token, subscription } = await createCredential(req.user.userId, {
        SubscriptionModel,
        rotate: true,
      });
      return res.json({
        connected: true,
        generatedAt: subscription.generatedAt,
        subscriptionPath: privateFeedPath(token),
      });
    } catch (error) {
      console.error("Calendar feed regeneration error:", error);
      return res.status(500).json({ error: "Could not regenerate calendar connection." });
    }
  }

  async function revoke(req, res) {
    try {
      await SubscriptionModel.updateOne(
        { userId: req.user.userId, active: true },
        { $set: { active: false, revokedAt: new Date() } }
      );
      return res.status(204).send();
    } catch (error) {
      console.error("Calendar feed revocation error:", error);
      return res.status(500).json({ error: "Could not disconnect calendar feed." });
    }
  }

  async function read(req, res) {
    const token = String(req.params.token || "");
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) {
      return res.status(404).send("Calendar feed not found.");
    }
    try {
      const calendar = await calendarForCredential(token);
      if (!calendar) return res.status(404).send("Calendar feed not found.");
      res.set({
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "inline; filename=afterlight-assignments.ics",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      return res.send(calendar);
    } catch (error) {
      console.error("Calendar feed read error:", error);
      return res.status(500).send("Calendar feed is temporarily unavailable.");
    }
  }

  return { status, generate, rotate, revoke, read };
}

function createCalendarFeedRouter(dependencies) {
  const router = express.Router();
  const handlers = createCalendarFeedHandlers(dependencies);
  router.get("/", handlers.status);
  router.post("/", handlers.generate);
  router.post("/rotate", handlers.rotate);
  router.delete("/", handlers.revoke);
  return router;
}

function createPublicCalendarFeedRouter(dependencies) {
  const router = express.Router();
  const handlers = createCalendarFeedHandlers(dependencies);
  router.get("/:token/assignments.ics", handlers.read);
  return router;
}

module.exports = createCalendarFeedRouter();
module.exports.publicRouter = createPublicCalendarFeedRouter();
module.exports.createCalendarFeedHandlers = createCalendarFeedHandlers;
module.exports.createCalendarFeedRouter = createCalendarFeedRouter;
module.exports.createPublicCalendarFeedRouter = createPublicCalendarFeedRouter;
