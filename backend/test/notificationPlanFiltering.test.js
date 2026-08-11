const test = require("node:test");
const assert = require("node:assert/strict");
const Organization = require("../models/organization");
const Notification = require("../models/notification");
const notificationRouter = require("../Routes/notifications");

function listNotificationsHandler() {
  const layer = notificationRouter.stack.find((candidate) => (
    candidate.route?.path === "/" && candidate.route.methods?.get
  ));
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function notificationQueryFor(serviceModel) {
  const originalOrganizationFindById = Organization.findById;
  const originalNotificationFind = Notification.find;
  let capturedQuery;
  try {
    Organization.findById = (organizationId) => ({
      select(selection) {
        assert.equal(organizationId, "org-1");
        assert.equal(selection, "serviceModel");
        return this;
      },
      async lean() { return { serviceModel }; },
    });
    Notification.find = (query) => {
      capturedQuery = query;
      return {
        sort() { return this; },
        limit() { return this; },
        async lean() { return []; },
      };
    };

    const req = {
      user: {
        userId: "user-1",
        organizationId: "org-1",
        role: "admin",
        accountScope: "organization",
        platformRole: null,
        assumedOrganization: false,
      },
      query: {},
    };
    const res = response();
    await listNotificationsHandler()(req, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
    return capturedQuery;
  } finally {
    Organization.findById = originalOrganizationFindById;
    Notification.find = originalNotificationFind;
  }
}

test("Boutique notification lists suppress stale monthly executive-summary notices", async () => {
  const boutiqueQuery = await notificationQueryFor("boutique");
  assert.deepEqual(boutiqueQuery, {
    userId: "user-1",
    organizationId: "org-1",
    type: { $ne: "monthly_portfolio_summary_ready" },
  });

  const managedQuery = await notificationQueryFor("managed");
  assert.deepEqual(managedQuery, {
    userId: "user-1",
    organizationId: "org-1",
  });
});
