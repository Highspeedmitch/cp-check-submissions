const os = require("os");
const WarRoomNotificationEvent = require("../models/warRoomNotificationEvent");
const { notifyPlatformAdministrators } = require("./notifications");
const { getPlatformWarRoom } = require("./platformWarRoom");
const { captureBackendException } = require("../monitoring");
const { startPollingWorker } = require("./pollingWorker");

const DEFAULT_POLL_MS = 30 * 1000;
const EVALUATION_INTERVAL_MS = 60 * 60 * 1000;
const LEASE_MS = 10 * 60 * 1000;

function workerId() {
  return `${os.hostname()}:${process.pid}:war-room-notifications`;
}

function buildWarRoomNotificationEvents(report) {
  if (!report?.period || !report?.summary) return [];
  const route = "/platform?view=war-room";
  const events = [];
  if (report.summary.organizationCount > 0) {
    const dedupeKey = `war-room-digest:${report.period.weekKey}`;
    const dueThisWeekCount = report.summary.dueThisWeekCount;
    const weeklyAssignmentLabel = dueThisWeekCount === 1 ? "assignment remains" : "assignments remain";
    events.push({
      dedupeKey,
      type: "war_room_weekly_digest",
      contextOrganizationId: null,
      periodKey: report.period.monthKey,
      weekKey: report.period.weekKey,
      event: {
        type: "war_room_weekly_digest",
        title: `Weekly War Room - ${report.period.weekLabel}`,
        body: `${report.summary.onTrackCount + report.summary.completeCount} on track, ${report.summary.atRiskCount} at risk, and ${report.summary.behindCount} behind. ${report.summary.remainingThisWeekCount} of ${dueThisWeekCount} ${weeklyAssignmentLabel} this week.`,
        route,
        entityId: dedupeKey,
      },
    });
  }
  report.organizations
    .filter((organization) => organization.status === "behind")
    .forEach((organization) => {
      const dedupeKey = `war-room-behind:${report.period.monthKey}:${organization.organizationId}`;
      const detail = organization.statusReasons[0] || "Monthly service delivery needs attention.";
      events.push({
        dedupeKey,
        type: "war_room_organization_behind",
        contextOrganizationId: organization.organizationId,
        periodKey: report.period.monthKey,
        weekKey: report.period.weekKey,
        event: {
          type: "war_room_organization_behind",
          title: `${organization.name} is behind`,
          body: `${detail} Open the Weekly War Room to review the portfolio.`,
          route,
          entityId: dedupeKey,
        },
      });
    });
  return events;
}

async function enqueueWarRoomNotificationEvent(event, {
  EventModel = WarRoomNotificationEvent,
  now = new Date(),
} = {}) {
  try {
    return await EventModel.findOneAndUpdate({ dedupeKey: event.dedupeKey }, {
      $setOnInsert: {
        ...event,
        status: "queued",
        availableAt: now,
      },
    }, { new: true, upsert: true, setDefaultsOnInsert: true });
  } catch (error) {
    // Multiple web/worker processes can evaluate the same period together.
    // The unique dedupe key is authoritative; return the winner of that race.
    if (error?.code === 11000 && typeof EventModel.findOne === "function") {
      return EventModel.findOne({ dedupeKey: event.dedupeKey });
    }
    throw error;
  }
}

async function evaluateWarRoomNotifications({
  getWarRoom = getPlatformWarRoom,
  EventModel = WarRoomNotificationEvent,
  now = new Date(),
} = {}) {
  const report = await getWarRoom({ now });
  const events = buildWarRoomNotificationEvents(report);
  await Promise.all(events.map((event) => enqueueWarRoomNotificationEvent(event, { EventModel, now })));
  return { report, enqueuedEventCount: events.length };
}

async function claimWarRoomNotificationEvent({
  EventModel = WarRoomNotificationEvent,
  now = new Date(),
  id = workerId(),
} = {}) {
  const staleLease = new Date(now.getTime() - LEASE_MS);
  return EventModel.findOneAndUpdate({
    $expr: { $lt: ["$attempts", "$maxAttempts"] },
    $or: [
      { status: { $in: ["queued", "failed"] }, availableAt: { $lte: now } },
      { status: "processing", lockedAt: { $lte: staleLease } },
    ],
  }, {
    $set: { status: "processing", lockedAt: now, lockedBy: id, lastError: "" },
    $inc: { attempts: 1 },
  }, { new: true, sort: { availableAt: 1, createdAt: 1 } });
}

async function deliverWarRoomNotificationEvent(notificationEvent, {
  notifyPlatform = notifyPlatformAdministrators,
  now = new Date(),
} = {}) {
  const delivery = await notifyPlatform({
    event: notificationEvent.event,
    contextOrganizationId: notificationEvent.contextOrganizationId || null,
  });
  notificationEvent.status = "completed";
  notificationEvent.completedAt = now;
  notificationEvent.failedAt = null;
  notificationEvent.lockedAt = null;
  notificationEvent.lockedBy = "";
  notificationEvent.lastError = delivery.failedNotifications
    ? `${delivery.failedNotifications} platform notification deliveries failed.`
    : "";
  await notificationEvent.save();
  return delivery;
}

async function recordWarRoomNotificationFailure(notificationEvent, error, now = new Date()) {
  const exhausted = notificationEvent.attempts >= notificationEvent.maxAttempts;
  notificationEvent.status = "failed";
  notificationEvent.failedAt = exhausted ? now : null;
  notificationEvent.availableAt = exhausted
    ? notificationEvent.availableAt
    : new Date(now.getTime() + Math.min(30 * 60 * 1000, 60000 * (2 ** Math.max(0, notificationEvent.attempts - 1))));
  notificationEvent.lockedAt = null;
  notificationEvent.lockedBy = "";
  notificationEvent.lastError = String(error?.message || "War Room notification delivery failed.").slice(0, 500);
  await notificationEvent.save();
  return notificationEvent;
}

async function processNextWarRoomNotification(options = {}) {
  const event = await claimWarRoomNotificationEvent(options);
  if (!event) return null;
  try {
    await deliverWarRoomNotificationEvent(event, options);
  } catch (error) {
    console.error(`War Room notification ${event.dedupeKey} failed:`, error.message);
    captureBackendException(error, {
      tags: {
        component: "background-worker",
        worker: "war-room-notification",
        phase: "process-event",
      },
      extra: { eventId: String(event._id), dedupeKey: event.dedupeKey },
    });
    await recordWarRoomNotificationFailure(event, error, options.now || new Date());
  }
  return event;
}

function startWarRoomNotificationWorker({
  pollMs = DEFAULT_POLL_MS,
  evaluationIntervalMs = EVALUATION_INTERVAL_MS,
} = {}) {
  let lastEvaluatedAt = 0;
  return startPollingWorker({
    name: "war-room-notification",
    pollMs,
    async runOnce() {
      if (Date.now() - lastEvaluatedAt >= evaluationIntervalMs) {
        await evaluateWarRoomNotifications();
        lastEvaluatedAt = Date.now();
      }
      return processNextWarRoomNotification();
    },
  });
}

module.exports = {
  EVALUATION_INTERVAL_MS,
  LEASE_MS,
  buildWarRoomNotificationEvents,
  claimWarRoomNotificationEvent,
  deliverWarRoomNotificationEvent,
  enqueueWarRoomNotificationEvent,
  evaluateWarRoomNotifications,
  processNextWarRoomNotification,
  recordWarRoomNotificationFailure,
  startWarRoomNotificationWorker,
};
