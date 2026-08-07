import moment from "moment";
import {
  assignmentFormDatesFromStored,
  assignmentDatesFromCalendarDrop,
  assignmentDatesFromCalendarSelection,
  calendarEventDatesFromAssignment,
  calendarEventOccursOnDay,
  storedAssignmentDate,
} from "./schedulerDates";

test("turns a selected calendar day into a single-day assignment", () => {
  expect(assignmentDatesFromCalendarSelection(
    new Date(2026, 7, 6),
    new Date(2026, 7, 7)
  )).toEqual({ startDate: "2026-08-06", endDate: "" });
});

test("turns an exclusive calendar range into inclusive assignment dates", () => {
  expect(assignmentDatesFromCalendarSelection(
    new Date(2026, 7, 6),
    new Date(2026, 7, 9)
  )).toEqual({ startDate: "2026-08-06", endDate: "2026-08-08" });
});

test("normalizes a dropped single-day event for the assignment API", () => {
  expect(assignmentDatesFromCalendarDrop(
    new Date(2026, 7, 6),
    new Date(2026, 7, 7)
  )).toEqual({ startDate: "2026-08-06", endDate: "2026-08-06" });
});

test("finds multi-day calendar events on each covered day", () => {
  const event = {
    start: new Date(2026, 7, 6),
    end: new Date(2026, 7, 9),
  };
  expect(calendarEventOccursOnDay(event, new Date(2026, 7, 7))).toBe(true);
  expect(calendarEventOccursOnDay(event, new Date(2026, 7, 9))).toBe(false);
});

test("reads the stored date without shifting an ISO timestamp into the prior day", () => {
  expect(storedAssignmentDate("2026-08-06T00:00:00.000Z")).toBe("2026-08-06");
});

test("turns an inclusive assignment range into an exclusive calendar range", () => {
  const range = calendarEventDatesFromAssignment(
    "2026-08-06T00:00:00.000Z",
    "2026-08-08T00:00:00.000Z"
  );

  expect(moment(range.start).format("YYYY-MM-DD")).toBe("2026-08-06");
  expect(moment(range.end).format("YYYY-MM-DD")).toBe("2026-08-09");
});

test("leaves the optional form end date blank for a one-day assignment", () => {
  expect(assignmentFormDatesFromStored(
    "2026-08-06T00:00:00.000Z",
    "2026-08-06T00:00:00.000Z"
  )).toEqual({ startDate: "2026-08-06", endDate: "" });
});
