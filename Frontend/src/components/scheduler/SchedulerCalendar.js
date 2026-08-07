import React, { useEffect, useMemo, useState } from "react";
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
      {event.assigneeLabel && <span>{event.assigneeLabel}</span>}
    </div>
  );
}

export default function SchedulerCalendar({
  events,
  onEventDrop,
  onSelectEvent,
  onSelectSlot,
  onNewAssignment,
  onHistory,
  showHistory = false,
  legend = [],
}) {
  const [isCompact, setIsCompact] = useState(compactViewport);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const selectedEvents = useMemo(() => selectedSlot
    ? events.filter((event) => calendarEventOccursOnDay(event, selectedSlot.start))
    : [], [events, selectedSlot]);

  const selectSlot = (slot) => {
    if (isCompact) {
      setSelectedSlot(slot);
      return;
    }
    onSelectSlot(slot);
  };

  const eventStyle = (event) => ({
    className: `beta-calendar-event ${event.tone || "customer"}`,
  });

  return (
    <section className="beta-scheduler-calendar-panel" aria-labelledby="visual-schedule-title">
      <div className="beta-scheduler-calendar-heading">
        <div>
          <span className="beta-eyebrow">Visual scheduling</span>
          <h2 id="visual-schedule-title">Assignment calendar</h2>
          <p>Select a date or drag across a range to begin an assignment.</p>
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
          defaultView="month"
          selectable
          resizable={false}
          popup
          longPressThreshold={250}
          onEventDrop={onEventDrop}
          onSelectEvent={onSelectEvent}
          onSelectSlot={selectSlot}
          eventPropGetter={eventStyle}
          components={{ toolbar: CalendarToolbar, event: AssignmentEvent }}
        />
      </DndProvider>

      {isCompact && selectedSlot && (
        <div className="beta-calendar-mobile-day" aria-live="polite">
          <div className="beta-calendar-mobile-day-heading">
            <div>
              <strong>{moment(selectedSlot.start).format("dddd, MMMM D")}</strong>
              <span>{selectedEvents.length
                ? `${selectedEvents.length} assignment${selectedEvents.length === 1 ? "" : "s"}`
                : "No assignments scheduled"}</span>
            </div>
            <button type="button" className="beta-button compact" onClick={() => onSelectSlot(selectedSlot)}>
              + Create Assignment
            </button>
          </div>
          {selectedEvents.map((event) => (
            <button type="button" className="beta-calendar-mobile-event" key={event._id}
              onClick={() => onSelectEvent(event)}>
              <strong>{event.propertyName || event.title}</strong>
              <span>{event.assigneeLabel || "Open assignment"}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
