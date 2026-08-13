const mongoose = require("mongoose");
const Invoice = require("../models/invoice");
const InvoiceReviewEmailAttempt = require("../models/invoiceReviewEmailAttempt");
const { notifyApDeliveryState } = require("./apDeliveryNotifications");

const FAILURE_TYPES = new Set(["bounce", "complaint", "reject", "rendering_failure"]);
const EVENT_RANK = {
  delivery_delay: 1,
  delivery: 2,
  bounce: 3,
  reject: 3,
  rendering_failure: 3,
  complaint: 4,
};

function normalizeEventType(value) {
  return String(value || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function eventTimestamp(event, type) {
  const detail = event[type === "delivery_delay" ? "deliveryDelay" : type];
  const value = detail?.timestamp || event.mail?.timestamp;
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function taggedInvoiceId(event) {
  const value = event.mail?.tags?.invoice_id;
  const id = Array.isArray(value) ? value[0] : value;
  return mongoose.Types.ObjectId.isValid(id) ? String(id) : "";
}

function taggedValue(event, name) {
  const value = event.mail?.tags?.[name];
  return String(Array.isArray(value) ? value[0] : value || "").trim();
}

function taggedReviewAttemptId(event) {
  const value = taggedValue(event, "review_attempt_id");
  return mongoose.Types.ObjectId.isValid(value) ? value : "";
}

function failureDetails(event, type) {
  if (type === "bounce") {
    const bounce = event.bounce || {};
    const recipient = bounce.bouncedRecipients?.[0] || {};
    const subtype = normalizeEventType(bounce.bounceSubType || "unknown").toUpperCase();
    return {
      code: `SES_BOUNCE_${subtype}`,
      message: String(recipient.diagnosticCode || `Amazon SES reported a ${bounce.bounceType || "hard"} bounce.`).slice(0, 500),
    };
  }
  if (type === "complaint") {
    return {
      code: "SES_COMPLAINT",
      message: "The AP recipient reported the invoice email as spam.",
    };
  }
  if (type === "reject") {
    return {
      code: "SES_REJECT",
      message: String(event.reject?.reason || "Amazon SES rejected the invoice email.").slice(0, 500),
    };
  }
  return {
    code: "SES_RENDERING_FAILURE",
    message: String(event.failure?.errorMessage || "Amazon SES could not render the invoice email.").slice(0, 500),
  };
}

function eventGuard(lastEventAt, lastEventRank, eventAt, rank, snsMessageId) {
  return {
    "delivery.lastEventMessageId": { $ne: snsMessageId },
    $or: [
      { "delivery.lastEventAt": { $exists: false } },
      { "delivery.lastEventAt": null },
      { "delivery.lastEventAt": { $lt: eventAt } },
      {
        "delivery.lastEventAt": eventAt,
        "delivery.lastEventRank": { $lt: rank },
      },
    ],
  };
}

function reviewAttemptStatus(recipients) {
  const statuses = recipients.map((recipient) => recipient.status);
  if (statuses.length && statuses.every((status) => status === "delivered")) return "delivered";
  if (statuses.length && statuses.every((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "failed")) return "partial_failure";
  if (statuses.some((status) => status === "delayed")) return "delayed";
  return "accepted";
}

async function applyReviewEmailDeliveryEvent(event, {
  type,
  rank,
  providerMessageId,
  snsMessageId = "",
  AttemptModel = InvoiceReviewEmailAttempt,
} = {}) {
  let attempt = await AttemptModel.findOne({
    "recipients.providerMessageId": providerMessageId,
  });
  if (!attempt) {
    const attemptId = taggedReviewAttemptId(event);
    if (attemptId) {
      const pending = await AttemptModel.findById(attemptId);
      if (pending?.status === "sending"
        || pending?.recipients?.some((recipient) => !recipient.providerMessageId)) {
        return { status: "retry", reason: "review_attempt_not_ready", type };
      }
    }
    return { status: "ignored", reason: "unmatched_review_message", type };
  }

  const eventAt = eventTimestamp(event, type);
  let changed = false;
  for (const recipient of attempt.recipients || []) {
    if (recipient.providerMessageId !== providerMessageId) continue;
    if (recipient.lastEventMessageId === snsMessageId) continue;
    const previousAt = recipient.lastEventAt ? new Date(recipient.lastEventAt) : null;
    const previousRank = Number(recipient.lastEventRank || 0);
    if (previousAt && (
      previousAt > eventAt
      || (previousAt.getTime() === eventAt.getTime() && previousRank >= rank)
    )) continue;

    recipient.lastEventAt = eventAt;
    recipient.lastEventType = type;
    recipient.lastEventMessageId = snsMessageId;
    recipient.lastEventRank = rank;
    if (type === "delivery") {
      recipient.status = "delivered";
      recipient.deliveredAt = eventAt;
      recipient.failedAt = null;
      recipient.error = "";
      recipient.errorCode = "";
    } else if (type === "delivery_delay") {
      recipient.status = "delayed";
      recipient.error = "The email provider reported a temporary delivery delay.";
      recipient.errorCode = "SES_DELIVERY_DELAY";
    } else {
      const failure = failureDetails(event, type);
      recipient.status = "failed";
      recipient.failedAt = eventAt;
      recipient.error = "Review email delivery failed.";
      recipient.errorCode = failure.code;
    }
    changed = true;
  }
  if (!changed) {
    return { status: "ignored", reason: "duplicate_or_stale", type, attemptId: attempt._id };
  }

  attempt.status = reviewAttemptStatus(attempt.recipients || []);
  attempt.error = ["failed", "partial_failure"].includes(attempt.status)
    ? "One or more review emails could not be delivered."
    : attempt.status === "delayed" ? "One or more review emails are delayed." : "";
  await attempt.save();
  console.info(JSON.stringify({
    event: "invoice_review_delivery_event",
    attemptId: String(attempt._id),
    invoiceId: String(attempt.invoiceId),
    organizationId: String(attempt.organizationId),
    provider: "ses",
    providerMessageId,
    deliveryStatus: attempt.status,
    deliveryEventType: type,
    snsMessageId,
  }));
  return {
    status: "updated",
    scope: "invoice_review",
    type,
    attemptId: attempt._id,
    deliveryStatus: attempt.status,
  };
}

async function applySesDeliveryEvent(event, {
  snsMessageId = "",
  InvoiceModel = Invoice,
  AttemptModel = InvoiceReviewEmailAttempt,
  notify = notifyApDeliveryState,
} = {}) {
  const type = normalizeEventType(event?.eventType || event?.notificationType);
  const rank = EVENT_RANK[type];
  if (!rank) return { status: "ignored", reason: "unsupported_event", type };

  const providerMessageId = String(event?.mail?.messageId || "").trim();
  if (!providerMessageId) return { status: "ignored", reason: "missing_message_id", type };

  if (taggedValue(event, "message_type") === "invoice_review") {
    return applyReviewEmailDeliveryEvent(event, {
      type,
      rank,
      providerMessageId,
      snsMessageId,
      AttemptModel,
    });
  }

  let invoice = await InvoiceModel.findOne({
    "delivery.provider": "ses",
    "delivery.providerMessageId": providerMessageId,
  });
  if (!invoice) {
    const historical = await InvoiceModel.findOne({
      "delivery.providerMessageIds": providerMessageId,
    }).select("_id");
    if (historical) return { status: "ignored", reason: "old_attempt", type };

    const invoiceId = taggedInvoiceId(event);
    if (invoiceId) {
      const pending = await InvoiceModel.findById(invoiceId).select("status delivery.status delivery.providerMessageId");
      if (pending && (pending.status === "approving" || pending.delivery?.status === "sending")) {
        return { status: "retry", reason: "invoice_not_ready", type };
      }
    }
    return { status: "ignored", reason: "unmatched_message", type };
  }

  const lastEventAt = invoice.delivery?.lastEventAt;
  const lastEventRank = invoice.delivery?.lastEventRank || 0;
  const eventAt = eventTimestamp(event, type);
  if (invoice.delivery?.lastEventMessageId === snsMessageId) {
    return { status: "ignored", reason: "duplicate", type, invoiceId: invoice._id };
  }
  if (lastEventAt && (
    lastEventAt > eventAt
    || (lastEventAt.getTime() === eventAt.getTime() && lastEventRank >= rank)
  )) {
    return { status: "ignored", reason: "stale", type, invoiceId: invoice._id };
  }
  if (invoice.delivery?.status === "failed" && !FAILURE_TYPES.has(type)) {
    return { status: "ignored", reason: "terminal_failure", type, invoiceId: invoice._id };
  }
  if (invoice.delivery?.status === "delivered" && type === "delivery_delay") {
    return { status: "ignored", reason: "already_delivered", type, invoiceId: invoice._id };
  }

  const set = {
    "delivery.lastEventAt": eventAt,
    "delivery.lastEventType": type,
    "delivery.lastEventMessageId": snsMessageId,
    "delivery.lastEventRank": rank,
  };
  const update = { $set: set };
  let notifyFailure = false;

  if (type === "delivery") {
    Object.assign(set, {
      "delivery.status": "delivered",
      "delivery.deliveredAt": eventAt,
      "delivery.error": "",
      "delivery.errorCode": "",
      "delivery.failedAt": null,
    });
  } else if (type === "delivery_delay") {
    Object.assign(set, {
      "delivery.status": "accepted",
      "delivery.error": "Amazon SES reported a temporary delay. The invoice email remains queued for delivery.",
      "delivery.errorCode": "SES_DELIVERY_DELAY",
    });
  } else {
    const failure = failureDetails(event, type);
    Object.assign(set, {
      status: "failed",
      "delivery.status": "failed",
      "delivery.failedAt": eventAt,
      "delivery.error": failure.message,
      "delivery.errorCode": failure.code,
    });
    if (invoice.status !== "failed") {
      update.$push = { statusHistory: { status: "failed", changedAt: eventAt } };
      notifyFailure = true;
    }
  }

  const guard = eventGuard(lastEventAt, lastEventRank, eventAt, rank, snsMessageId);
  const updated = await InvoiceModel.findOneAndUpdate(
    { _id: invoice._id, "delivery.providerMessageId": providerMessageId, ...guard },
    update,
    { new: true }
  );
  if (!updated) return { status: "ignored", reason: "concurrent_event", type, invoiceId: invoice._id };

  console.info(JSON.stringify({
    event: "invoice_ap_delivery_event",
    invoiceId: String(updated._id),
    organizationId: String(updated.organizationId),
    provider: "ses",
    providerMessageId,
    deliveryStatus: updated.delivery.status,
    deliveryEventType: type,
    snsMessageId,
  }));

  if (notifyFailure) {
    await notify(updated, "failed").catch((error) => {
      console.error("AP delivery event notification error:", error.message);
    });
  }
  return { status: "updated", type, invoiceId: updated._id, deliveryStatus: updated.delivery.status };
}

module.exports = {
  applyReviewEmailDeliveryEvent,
  applySesDeliveryEvent,
  failureDetails,
  normalizeEventType,
  reviewAttemptStatus,
};
