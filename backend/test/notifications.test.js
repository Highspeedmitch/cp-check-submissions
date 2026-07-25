const test = require("node:test");
const assert = require("node:assert/strict");
const {
  notificationData,
  disableInvalidTokens,
  sendUserNotification,
} = require("../services/notifications");

test("notification data is normalized for cross-platform delivery", () => {
  assert.deepEqual(notificationData({
    type: "assignment_created",
    route: "/dashboard",
    entityId: 42,
  }), {
    type: "assignment_created",
    route: "/dashboard",
    entityId: "42",
  });
});

test("invalid Firebase tokens are disabled", async () => {
  let update;
  const invalid = await disableInvalidTokens(
    ["valid-token", "expired-token"],
    [
      { success: true },
      {
        success: false,
        error: { code: "messaging/registration-token-not-registered" },
      },
    ],
    {
      async updateMany(query, change) {
        update = { query, change };
      },
    }
  );

  assert.deepEqual(invalid, ["expired-token"]);
  assert.deepEqual(update.query, { token: { $in: ["expired-token"] } });
  assert.deepEqual(update.change, { $set: { enabled: false } });
});

test("user notification is recorded and delivered to every enabled device", async () => {
  const saved = [];
  const notification = {
    delivery: {},
    async save() { saved.push(this.delivery); },
  };
  let message;
  const result = await sendUserNotification({
    organizationId: "org-1",
    userId: "user-1",
    type: "assignment_created",
    title: "New assignment",
    body: "Broadway Center was assigned to you.",
    entityId: "assignment-1",
    models: {
      Notification: {
        async create() { return notification; },
      },
      PushToken: {
        find() {
          return {
            select() { return this; },
            async lean() {
              return [{ token: "ios-token" }, { token: "web-token" }];
            },
          };
        },
        async updateMany() {},
      },
    },
    messaging: {
      async sendEachForMulticast(payload) {
        message = payload;
        return {
          successCount: 2,
          failureCount: 0,
          responses: [{ success: true }, { success: true }],
        };
      },
    },
  });

  assert.deepEqual(message.tokens, ["ios-token", "web-token"]);
  assert.equal(message.data.type, "assignment_created");
  assert.equal(result.successfulDevices, 2);
  assert.equal(saved[0].successfulDevices, 2);
});

test("PWA notification is delivered through Web Push", async () => {
  const notification = {
    delivery: {},
    async save() {},
  };
  let delivery;
  const result = await sendUserNotification({
    organizationId: "org-1",
    userId: "user-1",
    type: "assignment_created",
    title: "New assignment",
    body: "Broadway Center was assigned to you.",
    models: {
      Notification: { async create() { return notification; } },
      PushToken: {
        find() {
          return {
            select() { return this; },
            async lean() { return []; },
          };
        },
      },
      WebPushSubscription: {
        find() {
          return {
            select() { return this; },
            async lean() {
              return [{
                endpoint: "https://push.example/device",
                keys: { p256dh: "key", auth: "auth" },
              }];
            },
          };
        },
        async updateMany() {},
      },
    },
    messaging: null,
    webPushClient: {
      async sendNotification(subscription, payload) {
        delivery = { subscription, payload: JSON.parse(payload) };
      },
    },
  });

  assert.equal(delivery.subscription.endpoint, "https://push.example/device");
  assert.equal(delivery.payload.type, "assignment_created");
  assert.equal(result.successfulDevices, 1);
  assert.equal(result.failedDevices, 0);
});
