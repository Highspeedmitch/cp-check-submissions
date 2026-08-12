const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildWarRoomNotificationEvents,
  claimWarRoomNotificationEvent,
  deliverWarRoomNotificationEvent,
  evaluateWarRoomNotifications,
} = require("../services/warRoomNotifications");

function report() {
  return {
    period: {
      monthKey: "2026-08",
      weekKey: "2026-08-10",
      weekLabel: "Aug 10 - Aug 16",
    },
    summary: {
      organizationCount: 3,
      completeCount: 0,
      onTrackCount: 1,
      atRiskCount: 1,
      behindCount: 1,
      remainingThisWeekCount: 4,
      dueThisWeekCount: 7,
    },
    organizations: [{
      organizationId: "org-behind",
      name: "PICOR",
      status: "behind",
      statusReasons: ["1 property missed its scheduled work."],
    }, {
      organizationId: "org-risk",
      name: "Hybrid Client",
      status: "at_risk",
      statusReasons: ["Afterlight coverage is below its minimum."],
    }],
  };
}

test("notification evaluation creates one weekly digest and one event per behind portfolio", () => {
  const events = buildWarRoomNotificationEvents(report());

  assert.equal(events.length, 2);
  assert.equal(events[0].dedupeKey, "war-room-digest:2026-08-10");
  assert.match(events[0].event.body, /1 on track, 1 at risk, and 1 behind/i);
  assert.equal(events[1].dedupeKey, "war-room-behind:2026-08:org-behind");
  assert.equal(events[1].contextOrganizationId, "org-behind");
  assert.match(events[1].event.body, /missed its scheduled work/i);
});

test("evaluation upserts deterministic dedupe keys", async () => {
  const writes = [];
  const EventModel = {
    async findOneAndUpdate(query, update, options) {
      writes.push({ query, update, options });
      return { ...update.$setOnInsert };
    },
  };
  const result = await evaluateWarRoomNotifications({
    now: new Date("2026-08-11T18:00:00.000Z"),
    getWarRoom: async () => report(),
    EventModel,
  });

  assert.equal(result.enqueuedEventCount, 2);
  assert.deepEqual(writes.map((write) => write.query.dedupeKey), [
    "war-room-digest:2026-08-10",
    "war-room-behind:2026-08:org-behind",
  ]);
  assert.ok(writes.every((write) => write.options.upsert === true));
});

test("notification claims use an atomic lease", async () => {
  let captured;
  await claimWarRoomNotificationEvent({
    now: new Date("2026-08-11T18:00:00.000Z"),
    id: "worker-1",
    EventModel: {
      async findOneAndUpdate(query, update, options) {
        captured = { query, update, options };
        return { _id: "event-1" };
      },
    },
  });

  assert.equal(captured.update.$set.status, "processing");
  assert.equal(captured.update.$set.lockedBy, "worker-1");
  assert.equal(captured.update.$inc.attempts, 1);
  assert.deepEqual(captured.query.$expr, { $lt: ["$attempts", "$maxAttempts"] });
  assert.equal(captured.options.sort.availableAt, 1);
});

test("concurrent evaluators resolve a duplicate-key race to the existing event", async () => {
  const existing = { dedupeKey: "war-room-digest:2026-08-10", status: "queued" };
  const EventModel = {
    async findOneAndUpdate() {
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    },
    async findOne(query) {
      assert.deepEqual(query, { dedupeKey: existing.dedupeKey });
      return existing;
    },
  };

  const result = await evaluateWarRoomNotifications({
    getWarRoom: async () => ({
      ...report(),
      summary: { ...report().summary, behindCount: 0 },
      organizations: [],
    }),
    EventModel,
  });

  assert.equal(result.enqueuedEventCount, 1);
});

test("delivery fans out with platform scope and records completion", async () => {
  let payload;
  const event = {
    event: { type: "war_room_weekly_digest", title: "Digest", body: "Body", route: "/platform?view=war-room" },
    contextOrganizationId: null,
    status: "processing",
    async save() {},
  };
  const result = await deliverWarRoomNotificationEvent(event, {
    now: new Date("2026-08-11T18:00:00.000Z"),
    async notifyPlatform(value) {
      payload = value;
      return { recipientCount: 1, failedNotifications: 0 };
    },
  });

  assert.equal(payload.event.type, "war_room_weekly_digest");
  assert.equal(event.status, "completed");
  assert.equal(event.completedAt.toISOString(), "2026-08-11T18:00:00.000Z");
  assert.deepEqual(result, { recipientCount: 1, failedNotifications: 0 });
});
