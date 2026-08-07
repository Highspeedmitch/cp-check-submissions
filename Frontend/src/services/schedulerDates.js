import moment from "moment";

function day(value) {
  return moment(value).startOf("day");
}

export function storedAssignmentDate(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (dateOnly) return dateOnly;
  }
  return moment.utc(value).format("YYYY-MM-DD");
}

export function calendarEventDatesFromAssignment(start, end) {
  const startDate = storedAssignmentDate(start);
  const endDate = storedAssignmentDate(end) || startDate;
  return {
    start: moment(startDate, "YYYY-MM-DD", true).startOf("day").toDate(),
    // Stored assignment endings are inclusive; React Big Calendar endings are exclusive.
    end: moment(endDate, "YYYY-MM-DD", true).startOf("day").add(1, "day").toDate(),
  };
}

export function assignmentFormDatesFromStored(start, end) {
  const startDate = storedAssignmentDate(start);
  const endDate = storedAssignmentDate(end) || startDate;
  return {
    startDate,
    endDate: endDate === startDate ? "" : endDate,
  };
}

export function assignmentDatesFromCalendarSelection(start, end) {
  const selectedStart = day(start);
  let selectedEnd = day(end);

  // React Big Calendar represents all-day range endings as exclusive.
  if (selectedEnd.isAfter(selectedStart)) selectedEnd = selectedEnd.subtract(1, "day");
  if (selectedEnd.isBefore(selectedStart)) selectedEnd = selectedStart.clone();

  return {
    startDate: selectedStart.format("YYYY-MM-DD"),
    endDate: selectedEnd.isSame(selectedStart, "day")
      ? ""
      : selectedEnd.format("YYYY-MM-DD"),
  };
}

export function assignmentDatesFromCalendarDrop(start, end) {
  const selected = assignmentDatesFromCalendarSelection(start, end);
  return {
    startDate: selected.startDate,
    endDate: selected.endDate || selected.startDate,
  };
}

export function calendarEventOccursOnDay(event, selectedDate) {
  const selectedStart = day(selectedDate);
  const selectedEnd = selectedStart.clone().add(1, "day");
  return moment(event.start).isBefore(selectedEnd)
    && moment(event.end).isAfter(selectedStart);
}
