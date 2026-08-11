import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { calendarEventOccursOnDay } from "../../services/schedulerDates";

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

function compactViewport() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 760px)").matches;
}

function CalendarToolbar({ label, onNavigate, onView, view }) {
  return (
    <div className="beta-calendar-toolbar">
      <div className="beta-calendar-navigation" aria-label="Calendar navigation">
        <button type="button" onClick={() => onNavigate("PREV")} aria-label="Previous date range">‹</button>
        <button type="button" className="today" onClick={() => onNavigate("TODAY")}>Today</button>
        <button type="button" onClick={() => onNavigate("NEXT")} aria-label="Next date range">›</button>
      </div>
      <strong className="beta-calendar-period">{label}</strong>
      <div className="beta-calendar-views" aria-label="Calendar view">
        {["month", "week", "agenda"].map((value) => (
          <button type="button" key={value} className={view === value ? "active" : ""}
            onClick={() => onView(value)}>
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssignmentEvent({ event }) {
  return (
    <div className="beta-calendar-event-copy">
      <strong>{event.propertyName || event.title}</strong>
      {event.routeRunId && <span className="beta-calendar-route-label">ROUTE · {event.routeStopCount} stops</span>}
      {event.assigneeLabel && <span>{event.assigneeLabel}</span>}
    </div>
  );
}

function MonthDateHeader({ date, events, label, onOpenDay }) {
  const assignmentCount = events.filter((event) => calendarEventOccursOnDay(event, date)).length;
  const formattedDate = moment(date).format("dddd, MMMM D");

  const openDay = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenDay(date);
  };

  return (
    <div className="beta-calendar-date-header" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="rbc-button-link beta-calendar-date-button"
        aria-label={`View assignments for ${formattedDate}`} onClick={openDay}>
        {label}
      </button>
      {assignmentCount > 0 && (
        <button type="button" className="beta-calendar-day-count"
          aria-label={`View ${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"} on ${formattedDate}`}
          onClick={openDay}>
          <span>{assignmentCount}</span>
          <span className="beta-calendar-day-count-label">
            assignment{assignmentCount === 1 ? "" : "s"}
          </span>
        </button>
      )}
    </div>
  );
}

function DayAssignmentList({ events, onSelectEvent }) {
  if (!events.length) {
    return <p className="beta-calendar-day-empty">No assignments are scheduled for this day.</p>;
  }

  return (
    <div className="beta-calendar-day-events">
      {events.map((event) => (
        <button type="button" className={`beta-calendar-day-event ${event.tone || "customer"}`}
          key={event._id} onClick={() => onSelectEvent(event)}
          aria-label={`Edit ${event.routeRunId ? "ROUTE " : ""}${event.propertyName || event.title} assignment`}>
          <i aria-hidden="true" />
          <span>
            <strong>{event.propertyName || event.title}</strong>
            <small>{event.routeRunId
              ? `ROUTE assignment · ${event.routeStopCount} stops · ${event.assigneeLabel || "Open assignment"}`
              : event.assigneeLabel || "Open assignment"}</small>
          </span>
          <b aria-hidden="true">›</b>
        </button>
      ))}
    </div>
  );
}

export default function SchedulerCalendar({
  events = [],
  onEventDrop,
  onSelectEvent,
  onSelectSlot,
  onNewAssignment,
  onHistory,
  showHistory = false,
  legend = [],
}) {
  const [isCompact, setIsCompact] = useState(compactViewport);
  const [calendarView, setCalendarView] = useState("month");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const dayPanelCloseRef = useRef(null);
  const selectedDay = selectedSlot?.start || null;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!selectedDay || isCompact) return undefined;
    dayPanelCloseRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedSlot(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isCompact, selectedDay]);

  const selectedEvents = useMemo(() => selectedDay
    ? events.filter((event) => calendarEventOccursOnDay(event, selectedDay))
    : [], [events, selectedDay]);

  const openDay = useCallback((date) => {
    const start = new Date(date);
    setSelectedSlot({
      start,
      end: moment(start).add(1, "day").toDate(),
      slots: [start],
      action: "select",
    });
  }, []);

  const selectSlot = (slot) => {
    const isSingleMonthDay = calendarView === "month"
      && (slot.slots
        ? slot.slots.length === 1
        : moment(slot.end).startOf("day").diff(moment(slot.start).startOf("day"), "days") === 1);

    if (isCompact) {
      setSelectedSlot(slot);
      return;
    }
    if (isSingleMonthDay) {
      openDay(slot.start);
      return;
    }
    onSelectSlot(slot);
  };

  const changeView = (nextView) => {
    setCalendarView(nextView);
    if (nextView !== "month") setSelectedSlot(null);
  };

  const createAssignmentForDay = () => {
    const slot = selectedSlot;
    setSelectedSlot(null);
    onSelectSlot(slot);
  };

  const editAssignmentFromDay = (event) => {
    setSelectedSlot(null);
    onSelectEvent(event);
  };

  const monthDateHeader = useCallback((props) => (
    <MonthDateHeader {...props} events={events} onOpenDay={openDay} />
  ), [events, openDay]);

  const calendarComponents = useMemo(() => ({
    toolbar: CalendarToolbar,
    event: AssignmentEvent,
    month: { dateHeader: monthDateHeader },
  }), [monthDateHeader]);

  const eventStyle = (event) => ({
    className: `beta-calendar-event ${event.tone || "customer"}`,
  });

  return (
    <section className="beta-scheduler-calendar-panel" aria-labelledby="visual-schedule-title">
      <div className="beta-scheduler-calendar-heading">
        <div>
          <span className="beta-eyebrow">Visual scheduling</span>
          <h2 id="visual-schedule-title">Assignment calendar</h2>
          <p>Select a date to review its assignments, or drag across a range to create one.</p>
        </div>
        <div className="beta-scheduler-calendar-actions">
          {showHistory && <button type="button" className="beta-button secondary" onClick={onHistory}>
            Assignment History
          </button>}
          <button type="button" className="beta-button" onClick={onNewAssignment}>+ New Assignment</button>
        </div>
      </div>

      {legend.length > 0 && <div className="beta-calendar-legend" aria-label="Calendar legend">
        {legend.map((item) => <span key={item.tone}><i className={item.tone} />{item.label}</span>)}
      </div>}

      <DndProvider backend={HTML5Backend}>
        <DnDCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={["month", "week", "agenda"]}
          view={calendarView}
          onView={changeView}
          selectable
          resizable={false}
          popup={false}
          doShowMoreDrillDown={false}
          longPressThreshold={250}
          onEventDrop={onEventDrop}
          onSelectEvent={onSelectEvent}
          onSelectSlot={selectSlot}
          onShowMore={(overflowEvents, date) => openDay(date)}
          eventPropGetter={eventStyle}
          components={calendarComponents}
        />
      </DndProvider>

      {isCompact && selectedDay && (
        <div className="beta-calendar-mobile-day" aria-live="polite">
          <div className="beta-calendar-mobile-day-heading">
            <div>
              <strong>{moment(selectedDay).format("dddd, MMMM D")}</strong>
              <span>{selectedEvents.length
                ? `${selectedEvents.length} assignment${selectedEvents.length === 1 ? "" : "s"}`
                : "No assignments scheduled"}</span>
            </div>
            <button type="button" className="beta-button compact" onClick={createAssignmentForDay}>
              + Create Assignment
            </button>
          </div>
          <DayAssignmentList events={selectedEvents} onSelectEvent={editAssignmentFromDay} />
        </div>
      )}

      {!isCompact && selectedDay && (
        <div className="beta-calendar-day-overlay"
          onMouseDown={(event) => event.target === event.currentTarget && setSelectedSlot(null)}>
          <section className="beta-calendar-day-panel" role="dialog" aria-modal="true"
            aria-labelledby="calendar-day-panel-title">
            <div className="beta-calendar-day-panel-header">
              <div>
                <span className="beta-eyebrow">Daily schedule</span>
                <h2 id="calendar-day-panel-title">{moment(selectedDay).format("dddd, MMMM D")}</h2>
                <p>{selectedEvents.length
                  ? `${selectedEvents.length} assignment${selectedEvents.length === 1 ? "" : "s"} scheduled`
                  : "No assignments scheduled"}</p>
              </div>
              <button ref={dayPanelCloseRef} type="button" className="beta-dialog-close"
                aria-label="Close daily schedule" onClick={() => setSelectedSlot(null)}>×</button>
            </div>

            <DayAssignmentList events={selectedEvents} onSelectEvent={editAssignmentFromDay} />

            <div className="beta-calendar-day-panel-actions">
              <button type="button" className="beta-button" onClick={createAssignmentForDay}>
                + Create Assignment
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
