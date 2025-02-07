import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

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

  const handleCreateAssignment = (e) => {
    e.preventDefault();
    if (!token) {
      alert("Unauthorized. Please log in again.");
      return;
    }

    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  const events = assignments.map((assignment) => ({
    title: assignment.propertyName,
    start: new Date(assignment.startDate),
    end: new Date(assignment.endDate),
  }));

  return (
    <div style={{ maxWidth: "900px", width: "100%", margin: "0 auto", padding: "10px" }}>
      <button onClick={() => navigate("/dashboard")} style={{ marginBottom: "10px", padding: "10px", background: "#28a745", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }}>
        ← Return to Dashboard
      </button>

      <h2 style={{ textAlign: "center" }}>Scheduler</h2>

      <DndProvider backend={HTML5Backend}>
        <DnDCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={["month", "week"]}
          style={{ height: "500px", width: "100%" }}
          onEventDrop={onEventDrop}
          resizable
          onEventResize={onEventResize}
        />
      </DndProvider>
    </div>
  );
}

export default Scheduler;
