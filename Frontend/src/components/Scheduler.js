import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { HTML5Backend } from "react-dnd-html5-backend";
import { DndProvider } from "react-dnd";

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

function CustomToolbar({ label, onNavigate, onView, view }) {
  return (
    <div className="rbc-toolbar">
      {/* View Selection (Month/Week) at the top */}
      <div className="rbc-btn-group">
        <button onClick={() => onView("month")} className={view === "month" ? "active" : ""}>Month</button>
        <button onClick={() => onView("week")} className={view === "week" ? "active" : ""}>Week</button>
      </div>

      {/* Date Label in the center */}
      <span className="rbc-toolbar-label">{label}</span>

      {/* Navigation (Back/Today/Next) below the calendar */}
      <div className="rbc-btn-group">
        <button onClick={() => onNavigate("TODAY")}>Today</button>
        <button onClick={() => onNavigate("PREV")}>Back</button>
        <button onClick={() => onNavigate("NEXT")}>Next</button>
      </div>
    </div>
  );
}

function Scheduler() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = location.state?.token || localStorage.getItem("token");

  const [assignments, setAssignments] = useState([]);
  const [properties, setProperties] = useState([]);
  const [users, setUsers] = useState([]);
  const [newAssignment, setNewAssignment] = useState({
    propertyName: "",
    userId: "",
    startDate: "",
    endDate: "",
  });

  // Fetch assignments
  useEffect(() => {
    if (!token) return;
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/assignments", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setAssignments(data))
      .catch((err) => console.error("Error fetching assignments:", err));
  }, [token]);

  // Fetch properties
  useEffect(() => {
    if (!token) return;
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/properties", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setProperties(data))
      .catch((err) => console.error("Error fetching properties:", err));
  }, [token]);

  // Fetch users (only non-admins)
  useEffect(() => {
    if (!token) return;
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/users", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const filteredUsers = data.filter(user => user.role !== "admin");
        setUsers(filteredUsers);
      })
      .catch((err) => console.error("Error fetching users:", err));
  }, [token]);

  // Handle form submission
  const handleCreateAssignment = (e) => {
    e.preventDefault();
    if (!token) {
      alert("Unauthorized. Please log in again.");
      return;
    }

    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/assignments", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify(newAssignment),
    })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("✅ Assignment created successfully!");
        setAssignments([...assignments, data.assignment]);
        setNewAssignment({ propertyName: "", userId: "", startDate: "", endDate: "" });
      } else {
        alert("❌ " + (data.error || "Failed to create assignment."));
      }
    })
    .catch((err) => console.error("Error creating assignment:", err));
  };

  // Map assignments into events
  const events = assignments.map((assignment) => ({
    title: assignment.propertyName,
    start: new Date(assignment.startDate),
    end: new Date(assignment.endDate),
    allDay: true
  }));

  return (
    <div style={{ maxWidth: "900px", width: "100%", margin: "0 auto", padding: "10px" }}>
      <button 
        onClick={() => navigate("/dashboard")} 
        style={{
          marginBottom: "10px",
          padding: "10px",
          background: "#28a745",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer"
        }}
      >
        ← Return to Dashboard
      </button>

      <h2 style={{ textAlign: "center" }}>Scheduler</h2>

      <form onSubmit={handleCreateAssignment} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Inputs for property, user, start & end date */}
      </form>

      <div style={{ height: "500px", width: "100%", overflowX: "hidden" }}>
        <DndProvider backend={HTML5Backend}>
          <DnDCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            views={["month", "week"]}
            style={{ height: "500px", width: "100%" }}
            components={{ toolbar: CustomToolbar }} // Override toolbar
          />
        </DndProvider>
      </div>
    </div>
  );
}

export default Scheduler;
