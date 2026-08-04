const test = require("node:test");
const assert = require("node:assert/strict");
const {
  notificationData,
  disableInvalidTokens,
  notifyPlatformAdministrators,
  sendUserNotification,
} = require("../services/notifications");
const { notificationOwner } = require("../Routes/notifications");

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

test("notification reads preserve platform scope without exposing other users", () => {
  const query = notificationOwner({
    user: {
      userId: "platform-user-1",
      organizationId: "platform-home-org",
      platformRole: "platform_admin",
      assumedOrganization: false,
    },
  });

  assert.equal(query.userId, "platform-user-1");
  assert.deepEqual(query.$or, [
    { recipientScope: "platform" },
    {
      organizationId: "platform-home-org",
      recipientScope: { $ne: "platform" },
    },
  ]);
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

test("resource notifications reach devices across deployed customer organizations", async () => {
  let deviceQuery;
  const notification = { delivery: {}, async save() {} };
  await sendUserNotification({
    organizationId: "customer-org-1",
    userId: "resource-user-1",
    recipientScope: "afterlight_resource",
    type: "assignment_created",
    title: "New assignment",
    body: "Broadway Center was assigned to you.",
    models: {
      Notification: { async create() { return notification; } },
      PushToken: {
        find(query) {
          deviceQuery = query;
          return {
            select() { return this; },
            async lean() { return []; },
          };
        },
      },
    },
    messaging: null,
  });

  assert.deepEqual(deviceQuery, { userId: "resource-user-1", enabled: true });
});

test("platform notifications are stored with platform scope and reach devices across organizations", async () => {
  let storedNotification;
  let deviceQuery;
  const notification = { delivery: {}, async save() {} };
  await sendUserNotification({
    organizationId: "platform-home-org",
    contextOrganizationId: "customer-org-1",
    userId: "platform-user-1",
    recipientScope: "platform",
    type: "invoice_ap_delivery_failed",
    title: "AP delivery failed",
    body: "Delivery failed.",
    models: {
      Notification: {
        async create(value) {
          storedNotification = value;
          return notification;
        },
      },
      PushToken: {
        find(query) {
          deviceQuery = query;
          return { select() { return this; }, async lean() { return []; } };
        },
      },
    },
    messaging: null,
  });

  assert.equal(storedNotification.recipientScope, "platform");
  assert.equal(storedNotification.contextOrganizationId, "customer-org-1");
  assert.deepEqual(deviceQuery, { userId: "platform-user-1", enabled: true });
});

test("platform administrator fan-out excludes the actor and preserves tenant context", async () => {
  let query;
  const deliveries = [];
  const result = await notifyPlatformAdministrators({
    event: { type: "gusto_batch_paid", title: "Paid", body: "Paid", route: "/platform" },
    contextOrganizationId: "customer-org-1",
    excludeUserId: "platform-user-1",
    UserModel: {
      find(value) {
        query = value;
        return {
          select() { return this; },
          async lean() {
            return [
              { _id: "platform-user-2", organizationId: "platform-home-org" },
              { _id: "platform-user-3", organizationId: null },
            ];
          },
        };
      },
    },
    notify: async (payload) => deliveries.push(payload),
  });

  assert.deepEqual(query._id, { $ne: "platform-user-1" });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].recipientScope, "platform");
  assert.equal(deliveries[0].organizationId, "platform-home-org");
  assert.equal(deliveries[0].contextOrganizationId, "customer-org-1");
  assert.deepEqual(result, { recipientCount: 1, failedNotifications: 0 });
});
