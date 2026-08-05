const express = require("express");
const {
  confirmSnsSubscription,
  verifySnsMessage,
} = require("../services/snsMessageVerifier");
const { applySesDeliveryEvent } = require("../services/sesDeliveryEvents");

function parseEnvelope(body) {
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  return JSON.parse(String(body || ""));
}

function createSesEventsRouter({
  verify = verifySnsMessage,
  confirm = confirmSnsSubscription,
  applyEvent = applySesDeliveryEvent,
} = {}) {
  const router = express.Router();
  router.post("/", async (req, res) => {
    let envelope;
    try {
      envelope = parseEnvelope(req.body);
      await verify(envelope);
    } catch (error) {
      console.warn("Rejected SES delivery webhook:", error.message);
      return res.status(error.message === "SES event topic is not configured." ? 503 : 403).json({
        error: "SES delivery event could not be authenticated.",
      });
    }

    try {
      if (envelope.Type === "SubscriptionConfirmation") {
        await confirm(envelope);
        console.info(JSON.stringify({
          event: "ses_delivery_subscription_confirmed",
          topicArn: envelope.TopicArn,
        }));
        return res.status(204).end();
      }
      if (envelope.Type === "UnsubscribeConfirmation") return res.status(204).end();
      if (envelope.Type !== "Notification") return res.status(400).json({ error: "Unsupported SNS message type." });

      const sesEvent = JSON.parse(envelope.Message);
      const result = await applyEvent(sesEvent, { snsMessageId: envelope.MessageId });
      if (result.status === "retry") {
        return res.status(503).json({ error: "Invoice delivery record is not ready yet." });
      }
      return res.status(204).end();
    } catch (error) {
      console.error("SES delivery webhook error:", error.message);
      return res.status(500).json({ error: "Unable to process SES delivery event." });
    }
  });
  return router;
}

module.exports = createSesEventsRouter();
module.exports.createSesEventsRouter = createSesEventsRouter;
module.exports.parseEnvelope = parseEnvelope;
