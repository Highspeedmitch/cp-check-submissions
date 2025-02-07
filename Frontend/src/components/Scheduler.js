// Scheduler.js
import React from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

// Set up the localizer using moment
const localizer = momentLocalizer(moment);

function Scheduler({ assignments }) {
  // Map your assignments data into the event format expected by React Big Calendar.
  // Each event should have at least:
  //  - a title,
  //  - a start date, and 
  //  - an end date.
  const events = assignments.map((assignment) => ({
    title: assignment.propertyName,
    start: new Date(assignment.startDate),
    end: new Date(assignment.endDate),
  }));

  return (
    <div style={{ height: "500px" }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        views={["month", "week", "day"]}
        // You can customize further via props and CSS.
      />
    </div>
  );
}

export default Scheduler;
