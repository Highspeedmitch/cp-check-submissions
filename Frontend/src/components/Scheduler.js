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

  // Fetch users (exclude admins)
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
  }));

  return (
    <div className="scheduler-container">
      <button onClick={() => navigate("/dashboard")} className="return-button">
        ← Return to Dashboard
      </button>

      <h2 className="scheduler-title">Scheduler</h2>

      {/* Form Section */}
      <form onSubmit={handleCreateAssignment} className="assignment-form">
        <label>Property:</label>
        <select
          value={newAssignment.propertyName}
          onChange={(e) => setNewAssignment({ ...newAssignment, propertyName: e.target.value })}
          required
        >
          <option value="">Select Property</option>
          {properties.map((prop) => (
            <option key={prop.name} value={prop.name}>
              {prop.name}
            </option>
          ))}
        </select>

        <label>User:</label>
        <select
          value={newAssignment.userId}
          onChange={(e) => setNewAssignment({ ...newAssignment, userId: e.target.value })}
          required
        >
          <option value="">Select User</option>
          {users.map((user) => (
            <option key={user._id} value={user._id}>
              {user.email}
            </option>
          ))}
        </select>

        <label>Start Date:</label>
        <input type="datetime-local" value={newAssignment.startDate} onChange={(e) => setNewAssignment({ ...newAssignment, startDate: e.target.value })} required />

        <label>End Date:</label>
        <input type="datetime-local" value={newAssignment.endDate} onChange={(e) => setNewAssignment({ ...newAssignment, endDate: e.target.value })} required />

        <button type="submit" className="create-button">
          Create Assignment
        </button>
      </form>

      {/* Calendar Section */}
      <div className="calendar-wrapper">
        <DndProvider backend={HTML5Backend}>
          <DnDCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            views={["month", "week"]}
            style={{ height: "500px", width: "100%" }}
          />
        </DndProvider>
      </div>
    </div>
  );
}

export default Scheduler;
