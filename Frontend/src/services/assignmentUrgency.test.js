import {
  ASSIGNMENT_VIEWS,
  assignmentDateRangeLabel,
  assignmentTimingLabel,
  assignmentUrgency,
  buildAssignmentQueue,
  todayDateKey,
} from "./assignmentUrgency";

const now = new Date("2026-08-12T18:00:00.000Z");

test("builds attention, upcoming, and all queues by the inclusive due date", () => {
  const assignments = [
    { _id: "future", propertyName: "Future", startDate: "2026-08-14", endDate: "2026-08-15" },
    { _id: "today", propertyName: "Today", startDate: "2026-08-10", endDate: "2026-08-12" },
    { _id: "overdue", propertyName: "Overdue", startDate: "2026-08-09", endDate: "2026-08-11" },
  ];

  const queue = buildAssignmentQueue(assignments, { now, timeZone: "America/Phoenix" });

  expect(queue[ASSIGNMENT_VIEWS.ATTENTION].map((assignment) => assignment._id)).toEqual([
    "overdue",
    "today",
  ]);
  expect(queue[ASSIGNMENT_VIEWS.UPCOMING].map((assignment) => assignment._id)).toEqual(["future"]);
  expect(queue[ASSIGNMENT_VIEWS.ALL].map((assignment) => assignment._id)).toEqual([
    "overdue",
    "today",
    "future",
  ]);
});

test("uses the requested operational timezone to determine today", () => {
  const nearMidnight = new Date("2026-08-13T01:00:00.000Z");

  expect(todayDateKey(nearMidnight, "America/Phoenix")).toBe("2026-08-12");
  expect(todayDateKey(nearMidnight, "UTC")).toBe("2026-08-13");
  expect(assignmentUrgency(
    { endDate: "2026-08-12T00:00:00.000Z" },
    { now: nearMidnight, timeZone: "America/Phoenix" }
  )).toBe("today");
});

test("presents stable date-only ranges and relative deadline labels", () => {
  const assignment = { startDate: "2026-08-10T00:00:00.000Z", endDate: "2026-08-11T00:00:00.000Z" };

  expect(assignmentDateRangeLabel(assignment)).toBe("Aug 10, 2026 to Aug 11, 2026");
  expect(assignmentTimingLabel(assignment, { now, timeZone: "America/Phoenix" })).toBe("Overdue by 1 day");
  expect(assignmentTimingLabel({ endDate: "2026-08-13" }, { now, timeZone: "America/Phoenix" })).toBe("Due tomorrow");
});
