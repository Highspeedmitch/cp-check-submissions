const crypto = require("crypto");
const Assignment = require("../models/assignment");
const CalendarFeedSubscription = require("../models/calendarFeedSubscription");
const Organization = require("../models/organization");
const ResourceProfile = require("../models/resourceProfile");
const User = require("../models/user");
const { buildFrontendUrl } = require("../utils/frontendUrls");
const { availableWorkspaces } = require("./workspaceAccess");

const FEED_NAME = "Afterlight Assignments";
const FEED_PAST_DAYS = 90;
const FEED_FUTURE_MONTHS = 18;

function hashCalendarToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newCalendarToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function privateFeedPath(token) {
  return `/calendar/${encodeURIComponent(token)}/assignments.ics`;
}

function escapeCalendarText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldCalendarLine(line) {
  const segments = [];
  let segment = "";
  let limit = 75;
  for (const character of line) {
    if (Buffer.byteLength(segment + character, "utf8") > limit && segment) {
      segments.push(segment);
      segment = character;
      limit = 74;
    } else {
      segment += character;
    }
  }
  segments.push(segment);
  return segments.join("\r\n ");
}

function calendarDate(value, addDays = 0) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + addDays);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function calendarTimestamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function propertyAddress(organization, propertyName) {
  const property = (organization?.properties || []).find(({ name }) => name === propertyName);
  if (!property) return "";
  const street = property.physicalAddress || property.streetAddress || "";
  const locality = [property.city, property.state, property.zip].filter(Boolean).join(" ");
  return [street, property.suite, locality].filter(Boolean).join(", ");
}

function assignmentEventLines(assignment, organization, generatedAt) {
  const canceled = assignment.status === "canceled";
  const workspacePath = assignment.resourceProfileId ? "/resource" : "/dashboard";
  const title = assignment.eventType || "Property inspection";
  const location = propertyAddress(organization, assignment.propertyName);
  const lines = [
    "BEGIN:VEVENT",
    `UID:assignment-${assignment._id}@afterlightinspections.com`,
    `DTSTAMP:${calendarTimestamp(generatedAt)}`,
    `CREATED:${calendarTimestamp(assignment.createdAt || generatedAt)}`,
    `LAST-MODIFIED:${calendarTimestamp(assignment.updatedAt || generatedAt)}`,
    `SEQUENCE:${Number(assignment.calendarSequence || 0)}`,
    `DTSTART;VALUE=DATE:${calendarDate(assignment.startDate)}`,
    `DTEND;VALUE=DATE:${calendarDate(assignment.endDate, 1)}`,
    `SUMMARY:${escapeCalendarText(`${title} - ${assignment.propertyName}`)}`,
    `STATUS:${canceled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
  ];
  if (location) lines.push(`LOCATION:${escapeCalendarText(location)}`);
  const url = buildFrontendUrl(workspacePath);
  lines.push(`DESCRIPTION:${escapeCalendarText("Assigned through Afterlight. Open Afterlight for current assignment details.")}`);
  lines.push(`URL:${url}`);
  lines.push("END:VEVENT");
  return lines;
}

function routeEventLines(assignments, generatedAt) {
  const ordered = [...assignments].sort(
    (first, second) => (first.routeStopIndex || 0) - (second.routeStopIndex || 0)
  );
  const first = ordered[0];
  const canceled = ordered.every((assignment) => assignment.status === "canceled")
    || (ordered.some((assignment) => assignment.status === "canceled")
      && !ordered.some((assignment) => assignment.status === "scheduled"));
  const routeName = first.routeName || "Property route";
  const stopCount = first.routeStopCount || ordered.length;
  const workspacePath = first.resourceProfileId ? "/resource" : "/dashboard";
  const latestUpdatedAt = ordered.reduce((latest, assignment) => {
    const candidate = new Date(assignment.updatedAt || generatedAt);
    return candidate > latest ? candidate : latest;
  }, new Date(first.updatedAt || generatedAt));
  const sequence = Math.max(...ordered.map((assignment) => Number(assignment.calendarSequence || 0)));
  const stopSummary = ordered.map((assignment) =>
    `${Number(assignment.routeStopIndex || 0) + 1}. ${assignment.propertyName}`
  ).join("; ");
  return [
    "BEGIN:VEVENT",
    `UID:route-${first.routeRunId}@afterlightinspections.com`,
    `DTSTAMP:${calendarTimestamp(generatedAt)}`,
    `CREATED:${calendarTimestamp(first.createdAt || generatedAt)}`,
    `LAST-MODIFIED:${calendarTimestamp(latestUpdatedAt)}`,
    `SEQUENCE:${sequence}`,
    `DTSTART;VALUE=DATE:${calendarDate(first.startDate)}`,
    `DTEND;VALUE=DATE:${calendarDate(first.endDate, 1)}`,
    `SUMMARY:${escapeCalendarText(`ROUTE: ${routeName} (${stopCount} stops)`)}`,
    `STATUS:${canceled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    `DESCRIPTION:${escapeCalendarText(`ROUTE assignment with ${stopCount} stops: ${stopSummary}. Open Afterlight for current route details.`)}`,
    `URL:${buildFrontendUrl(workspacePath)}`,
    "END:VEVENT",
  ];
}

function buildAssignmentCalendar({ assignments = [], organizations = [], generatedAt = new Date() } = {}) {
  const organizationsById = new Map(organizations.map((organization) => [
    String(organization._id),
    organization,
  ]));
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Afterlight//Private Assignment Calendar//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${FEED_NAME}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  const emittedRouteRuns = new Set();
  for (const assignment of assignments) {
    if (assignment.routeRunId) {
      const routeRunId = String(assignment.routeRunId);
      if (emittedRouteRuns.has(routeRunId)) continue;
      emittedRouteRuns.add(routeRunId);
      lines.push(...routeEventLines(
        assignments.filter((candidate) => String(candidate.routeRunId || "") === routeRunId),
        generatedAt
      ));
    } else {
      lines.push(...assignmentEventLines(
        assignment,
        organizationsById.get(String(assignment.organizationId)),
        generatedAt
      ));
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`;
}

async function feedAssignments(userId, {
  AssignmentModel = Assignment,
  OrganizationModel = Organization,
  authorization = {},
  now = new Date(),
} = {}) {
  const pastBoundary = new Date(now);
  pastBoundary.setUTCDate(pastBoundary.getUTCDate() - FEED_PAST_DAYS);
  const futureBoundary = new Date(now);
  futureBoundary.setUTCMonth(futureBoundary.getUTCMonth() + FEED_FUTURE_MONTHS);

  const scope = [];
  if (authorization.allowOrganization && authorization.organizationId) {
    scope.push({
      organizationId: authorization.organizationId,
      resourceProfileId: null,
    });
  }
  if (authorization.allowResource) {
    scope.push({ resourceProfileId: { $ne: null } });
  }
  if (!scope.length) return { assignments: [], organizations: [] };

  const query = {
    userId,
    status: { $in: ["scheduled", "completed", "canceled"] },
    startDate: { $lte: futureBoundary },
    endDate: { $gte: pastBoundary },
  };
  if (scope.length === 1) Object.assign(query, scope[0]);
  else query.$or = scope;

  const assignments = await AssignmentModel.find(query).select(
    "_id organizationId propertyName propertyId startDate endDate eventType status resourceProfileId calendarSequence createdAt updatedAt routeRunId routeId routeName routeStopIndex routeStopCount serviceDate"
  ).sort({ startDate: 1 }).lean();
  const organizationIds = [...new Set(assignments.map(({ organizationId }) => String(organizationId)))];
  const organizations = organizationIds.length
    ? await OrganizationModel.find({ _id: { $in: organizationIds } })
      .select("name properties.name properties.physicalAddress properties.streetAddress properties.suite properties.city properties.state properties.zip")
      .lean()
    : [];
  return { assignments, organizations };
}

async function createFeedCredential(userId, {
  SubscriptionModel = CalendarFeedSubscription,
  rotate = false,
} = {}) {
  const token = newCalendarToken();
  const now = new Date();
  const query = rotate ? { userId } : { userId, active: { $ne: true } };
  try {
    const subscription = await SubscriptionModel.findOneAndUpdate(
      query,
      {
        $set: {
          tokenHash: hashCalendarToken(token),
          active: true,
          generatedAt: now,
          revokedAt: null,
          lastAccessedAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { subscription, token };
  } catch (error) {
    if (error?.code === 11000 && !rotate) {
      const conflict = new Error("A calendar feed is already connected. Regenerate it to replace the current link.");
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
}

async function calendarForToken(token, {
  SubscriptionModel = CalendarFeedSubscription,
  UserModel = User,
  ResourceProfileModel = ResourceProfile,
  AssignmentModel = Assignment,
  OrganizationModel = Organization,
  now = new Date(),
} = {}) {
  const subscription = await SubscriptionModel.findOne({
    tokenHash: hashCalendarToken(token),
  }).select("+tokenHash userId active").lean();
  if (!subscription) return null;

  if (!subscription.active) {
    return buildAssignmentCalendar({ generatedAt: now });
  }

  const user = await UserModel.findOne({
    _id: subscription.userId,
    accountStatus: { $ne: "inactive" },
  }).select("_id accountScope organizationId organizationArchivedAt").lean();
  if (!user) {
    return buildAssignmentCalendar({ generatedAt: now });
  }

  const workspaces = await availableWorkspaces(user, ResourceProfileModel);

  const { assignments, organizations } = await feedAssignments(subscription.userId, {
    AssignmentModel,
    OrganizationModel,
    authorization: {
      allowOrganization: workspaces.includes("organization"),
      allowResource: workspaces.includes("afterlight_resource"),
      organizationId: user.organizationId,
    },
    now,
  });
  await SubscriptionModel.updateOne(
    { _id: subscription._id },
    { $set: { lastAccessedAt: now } }
  );
  return buildAssignmentCalendar({ assignments, organizations, generatedAt: now });
}

module.exports = {
  FEED_FUTURE_MONTHS,
  FEED_NAME,
  FEED_PAST_DAYS,
  buildAssignmentCalendar,
  calendarForToken,
  createFeedCredential,
  escapeCalendarText,
  foldCalendarLine,
  hashCalendarToken,
  newCalendarToken,
  privateFeedPath,
};
