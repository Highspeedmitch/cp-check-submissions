const test = require("node:test");
const assert = require("node:assert/strict");
const CalendarFeedSubscription = require("../models/calendarFeedSubscription");
const {
  buildAssignmentCalendar,
  calendarForToken,
  createFeedCredential,
  hashCalendarToken,
  newCalendarToken,
} = require("../services/calendarFeed");
const { createCalendarFeedHandlers } = require("../Routes/calendarFeed");

function chained(value) {
  return {
    select() { return this; },
    sort() { return this; },
    async lean() { return value; },
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    set(headers) { Object.assign(this.headers, headers); return this; },
  };
}

test("calendar feed subscription schema stores only a unique hash per user", () => {
  const tokenHash = CalendarFeedSubscription.schema.path("tokenHash");
  const userId = CalendarFeedSubscription.schema.path("userId");
  assert.equal(tokenHash.options.select, false);
  assert.equal(tokenHash.options.unique, true);
  assert.equal(userId.options.unique, true);
  assert.equal(CalendarFeedSubscription.schema.options.autoIndex, false);
});

test("calendar credentials are random and only their hash is persisted", async () => {
  let persisted;
  const SubscriptionModel = {
    async findOneAndUpdate(query, update, options) {
      persisted = { query, update, options };
      return { generatedAt: update.$set.generatedAt };
    },
  };

  const { token } = await createFeedCredential("user-1", { SubscriptionModel });

  assert.match(token, /^[A-Za-z0-9_-]{40,128}$/);
  assert.equal(persisted.update.$set.tokenHash, hashCalendarToken(token));
  assert.equal(JSON.stringify(persisted).includes(token), false);
  assert.deepEqual(persisted.query, { userId: "user-1", active: { $ne: true } });
  assert.equal(persisted.options.upsert, true);
  assert.notEqual(newCalendarToken(), newCalendarToken());
});

test("calendar output uses stable all-day events, safe text, and explicit cancellations", () => {
  const generatedAt = new Date("2026-08-03T20:00:00.000Z");
  const base = {
    _id: "assignment-1",
    userId: "user-1",
    organizationId: "org-1",
    propertyName: "Black Crown, North; Wing",
    startDate: new Date("2026-08-10T00:00:00.000Z"),
    endDate: new Date("2026-08-12T00:00:00.000Z"),
    eventType: "QA Check",
    resourceProfileId: "resource-1",
    calendarSequence: 3,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-03T19:00:00.000Z"),
  };
  const calendar = buildAssignmentCalendar({
    assignments: [
      { ...base, status: "scheduled" },
      { ...base, _id: "assignment-2", status: "canceled", calendarSequence: 4 },
    ],
    organizations: [{
      _id: "org-1",
      properties: [{
        name: base.propertyName,
        physicalAddress: "100 Main St",
        city: "Tucson",
        state: "AZ",
        zip: "85701",
      }],
    }],
    generatedAt,
  });

  assert.match(calendar, /UID:assignment-assignment-1@afterlightinspections\.com/);
  assert.match(calendar, /DTSTART;VALUE=DATE:20260810/);
  assert.match(calendar, /DTEND;VALUE=DATE:20260813/);
  assert.match(calendar, /SUMMARY:QA Check - Black Crown\\, North\\; Wing/);
  assert.match(calendar, /LOCATION:100 Main St\\, Tucson AZ 85701/);
  assert.match(calendar, /SEQUENCE:3/);
  assert.match(calendar, /STATUS:CANCELLED/);
  assert.equal(calendar.endsWith("\r\n"), true);
  assert.doesNotMatch(calendar, /compensation|invoice|access instruction|one-time|checklist|internal note/i);
});

test("a valid feed queries assignments only for its user across organizations", async () => {
  let assignmentQuery;
  let lastAccessUpdate;
  const now = new Date("2026-08-03T20:00:00.000Z");
  const SubscriptionModel = {
    findOne(query) {
      assert.equal(query.tokenHash, hashCalendarToken("a".repeat(43)));
      return chained({ _id: "feed-1", userId: "user-1", active: true });
    },
    async updateOne(query, update) { lastAccessUpdate = { query, update }; },
  };
  const UserModel = {
    findOne(query) {
      assert.equal(query._id, "user-1");
      assert.deepEqual(query.accountStatus, { $ne: "inactive" });
      return chained({ _id: "user-1", accountScope: "organization", organizationId: "home-org" });
    },
  };
  const ResourceProfileModel = {
    findOne(query) {
      assert.equal(query.userId, "user-1");
      assert.deepEqual(query.status, { $ne: "suspended" });
      return chained({ _id: "resource-1" });
    },
  };
  const assignments = [
    {
      _id: "a1",
      userId: "user-1",
      organizationId: "org-1",
      resourceProfileId: "resource-1",
      propertyName: "Property A",
      startDate: new Date("2026-08-10T00:00:00.000Z"),
      endDate: new Date("2026-08-10T00:00:00.000Z"),
      status: "scheduled",
    },
    {
      _id: "a2",
      userId: "user-1",
      organizationId: "org-2",
      resourceProfileId: "resource-1",
      propertyName: "Property B",
      startDate: new Date("2026-08-11T00:00:00.000Z"),
      endDate: new Date("2026-08-11T00:00:00.000Z"),
      status: "scheduled",
    },
  ];
  const AssignmentModel = {
    find(query) { assignmentQuery = query; return chained(assignments); },
  };
  const OrganizationModel = {
    find(query) {
      assert.deepEqual(query._id.$in.sort(), ["org-1", "org-2"]);
      return chained([{ _id: "org-1", properties: [] }, { _id: "org-2", properties: [] }]);
    },
  };

  const calendar = await calendarForToken("a".repeat(43), {
    SubscriptionModel,
    UserModel,
    ResourceProfileModel,
    AssignmentModel,
    OrganizationModel,
    now,
  });

  assert.equal(assignmentQuery.userId, "user-1");
  assert.deepEqual(assignmentQuery.status, { $in: ["scheduled", "completed", "canceled"] });
  assert.deepEqual(assignmentQuery.$or, [
    { organizationId: "home-org", resourceProfileId: null },
    { resourceProfileId: { $ne: null } },
  ]);
  assert.match(calendar, /Property A/);
  assert.match(calendar, /Property B/);
  assert.deepEqual(lastAccessUpdate, {
    query: { _id: "feed-1" },
    update: { $set: { lastAccessedAt: now } },
  });
});

test("revoked credentials publish an empty calendar so clients can clear cached events", async () => {
  const SubscriptionModel = {
    findOne() { return chained({ _id: "feed-1", userId: "user-1", active: false }); },
  };
  const calendar = await calendarForToken("b".repeat(43), {
    SubscriptionModel,
    UserModel: { findOne() { assert.fail("revoked feeds must not query user data"); } },
  });
  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.doesNotMatch(calendar, /BEGIN:VEVENT/);
});

test("a suspended resource workspace is removed from a dual user's live feed scope", async () => {
  let assignmentQuery;
  const SubscriptionModel = {
    findOne() { return chained({ _id: "feed-1", userId: "user-1", active: true }); },
    async updateOne() {},
  };
  const calendar = await calendarForToken("d".repeat(43), {
    SubscriptionModel,
    UserModel: {
      findOne() {
        return chained({
          _id: "user-1",
          accountScope: "organization",
          organizationId: "home-org",
        });
      },
    },
    ResourceProfileModel: {
      findOne() { return chained(null); },
    },
    AssignmentModel: {
      find(query) {
        assignmentQuery = query;
        return chained([]);
      },
    },
  });

  assert.equal(assignmentQuery.organizationId, "home-org");
  assert.equal(assignmentQuery.resourceProfileId, null);
  assert.equal(assignmentQuery.$or, undefined);
  assert.doesNotMatch(calendar, /BEGIN:VEVENT/);
});

test("management endpoints return the private path only at creation and expose status without it", async () => {
  const generatedAt = new Date("2026-08-03T20:00:00.000Z");
  const SubscriptionModel = {
    findOne() { return chained({ generatedAt, lastAccessedAt: null }); },
  };
  const handlers = createCalendarFeedHandlers({
    SubscriptionModel,
    createCredential: async () => ({
      token: "c".repeat(43),
      subscription: { generatedAt },
    }),
  });
  const req = {
    user: { userId: "user-1" },
    protocol: "https",
    get: () => "dev-api.example.com",
  };
  const statusResponse = response();
  await handlers.status(req, statusResponse);
  assert.deepEqual(statusResponse.body, {
    connected: true,
    generatedAt,
    lastAccessedAt: null,
  });
  assert.equal("subscriptionPath" in statusResponse.body, false);

  const generationResponse = response();
  await handlers.generate(req, generationResponse);
  assert.equal(generationResponse.statusCode, 201);
  assert.equal(
    generationResponse.body.subscriptionPath,
    `/calendar/${"c".repeat(43)}/assignments.ics`
  );
});
