import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = momentLocalizer(moment);

function Scheduler() {
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

  // ✅ Fetch assignments
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

  // ✅ Fetch properties for selection
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

  // ✅ Fetch users for selection (DEBUG ADDED)
  useEffect(() => {
    if (!token) return;
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/users", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("Users fetched:", data); // Debugging to check if users are coming in
        setUsers(data);
      })
      .catch((err) => console.error("Error fetching users:", err));
  }, [token]);

  // ✅ Handle form submission (create new assignment)
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
        setNewAssignment({ propertyName: "", userId: "", startDate: "", endDate: "" }); // Reset form
      } else {
        alert("❌ " + (data.error || "Failed to create assignment."));
      }
    })
    .catch((err) => console.error("Error creating assignment:", err));
  };

  // ✅ Map assignments into events for the calendar
  const events = assignments.map((assignment) => ({
    title: assignment.propertyName,
    start: new Date(assignment.startDate),
    end: new Date(assignment.endDate),
  }));

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px" }}>
      <h2>Scheduler</h2>
  
      {/* Assignment Creation Form */}
      <form onSubmit={handleCreateAssignment} style={{ marginBottom: "20px" }}>
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
        <input
          type="datetime-local"
          value={newAssignment.startDate}
          onChange={(e) => setNewAssignment({ ...newAssignment, startDate: e.target.value })}
          required
        />
  
        <label>End Date:</label>
        <input
          type="datetime-local"
          value={newAssignment.endDate}
          onChange={(e) => setNewAssignment({ ...newAssignment, endDate: e.target.value })}
          required
        />
  
        <button type="submit" style={{ marginTop: "10px", padding: "10px 15px", background: "#007bff", color: "white", border: "none", borderRadius: "5px" }}>
          Create Assignment
        </button>
      </form>
  
      {/* Calendar Display (Now Properly Contained) */}
      <div style={{ height: "600px", width: "100%", overflow: "hidden" }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={["month", "week", "day"]}
          style={{ height: "100%", width: "100%" }} // Ensure proper scaling
        />
      </div>
    </div>
  );  
}

export default Scheduler;
