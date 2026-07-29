const firebaseAdmin = require("firebase-admin");
const webPush = require("web-push");
const PushToken = require("../models/PushToken");
const WebPushSubscription = require("../models/webPushSubscription");
const Notification = require("../models/notification");
const { getFrontendUrl } = require("../utils/frontendUrls");

const webPushConfigured = Boolean(
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
);
if (webPushConfigured) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT
      || `mailto:${process.env.SYSTEM_EMAIL_ADDRESS || "notifications@afterlightinspections.com"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function notificationData({ type, route, entityId }) {
  return {
    type: String(type),
    route: route || "/dashboard",
    entityId: entityId ? String(entityId) : "",
  };
}

async function disableInvalidTokens(tokens, responses, PushTokenModel = PushToken) {
  const invalidTokens = responses.flatMap((response, index) => {
    return !response.success && INVALID_TOKEN_CODES.has(response.error?.code)
      ? [tokens[index]]
      : [];
  });
  if (invalidTokens.length) {
    await PushTokenModel.updateMany(
      { token: { $in: invalidTokens } },
      { $set: { enabled: false } }
    );
  }
  return invalidTokens;
}

async function sendUserNotification({
  organizationId,
  userId,
  type,
  title,
  body,
  route = "/dashboard",
  entityId = "",
  models = { PushToken, WebPushSubscription, Notification },
  messaging = firebaseAdmin.apps.length ? firebaseAdmin.messaging() : null,
  webPushClient = webPushConfigured ? webPush : null,
}) {
  const notification = await models.Notification.create({
    organizationId,
    userId,
    type,
    title,
    body,
    route,
    entityId: entityId ? String(entityId) : "",
  });
  const devices = await models.PushToken.find({
    organizationId,
    userId,
    enabled: true,
  }).select("token").lean();
  const webSubscriptions = models.WebPushSubscription
    ? await models.WebPushSubscription.find({
      organizationId,
      userId,
      enabled: true,
    }).select("endpoint keys").lean()
    : [];

  if ((!devices.length || !messaging) && (!webSubscriptions.length || !webPushClient)) {
    return { notification, successfulDevices: 0, failedDevices: 0 };
  }

  const tokens = devices.map((device) => device.token);
  const frontendUrl = getFrontendUrl();
  let successfulDevices = 0;
  let failedDevices = 0;

  if (tokens.length && messaging) {
    try {
      const result = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: notificationData({ type, route, entityId }),
        apns: { payload: { aps: { sound: "default" } } },
        android: { priority: "high" },
      });
      await disableInvalidTokens(tokens, result.responses, models.PushToken);
      successfulDevices += result.successCount;
      failedDevices += result.failureCount;
    } catch (error) {
      failedDevices += tokens.length;
      console.error("Native notification delivery error:", error);
    }
  }

  if (webSubscriptions.length && webPushClient) {
    const payload = JSON.stringify({
      title,
      body,
      route: `${frontendUrl}${route}`,
      type,
      entityId: entityId ? String(entityId) : "",
    });
    const deliveries = await Promise.allSettled(webSubscriptions.map((subscription) => {
      return webPushClient.sendNotification({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      }, payload);
    }));
    const expiredEndpoints = [];
    deliveries.forEach((delivery, index) => {
      if (delivery.status === "fulfilled") {
        successfulDevices += 1;
      } else {
        failedDevices += 1;
        if ([404, 410].includes(delivery.reason?.statusCode)) {
          expiredEndpoints.push(webSubscriptions[index].endpoint);
        }
      }
    });
    if (expiredEndpoints.length) {
      await models.WebPushSubscription.updateMany(
        { endpoint: { $in: expiredEndpoints } },
        { $set: { enabled: false } }
      );
    }
  }

  notification.delivery = {
    attemptedAt: new Date(),
    successfulDevices,
    failedDevices,
  };
  await notification.save();

  return {
    notification,
    successfulDevices,
    failedDevices,
  };
}

module.exports = {
  INVALID_TOKEN_CODES,
  notificationData,
  disableInvalidTokens,
  sendUserNotification,
};
