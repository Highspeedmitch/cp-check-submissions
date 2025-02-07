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

  const [editingAssignment, setEditingAssignment] = useState(null); // Holds event being edited

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

  // Handle form submission (New or Editing)
  const handleSaveAssignment = (e) => {
    e.preventDefault();
    if (!token) {
      alert("Unauthorized. Please log in again.");
      return;
    }
  
    console.log("Editing assignment:", editingAssignment);
    
    const url = editingAssignment
      ? `https://cp-check-submissions-dev-backend.onrender.com/api/assignments/${editingAssignment._id}`
      : "https://cp-check-submissions-dev-backend.onrender.com/api/assignments";
  
    const method = editingAssignment ? "PUT" : "POST";
  
    const formattedAssignment = {
      ...newAssignment,
      startDate: new Date(newAssignment.startDate).toISOString(),
      endDate: new Date(newAssignment.endDate).toISOString(),
    };
  
    fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(formattedAssignment),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("Server response:", data);
        if (data.success) {
          alert("✅ Assignment saved successfully!");
          setAssignments(
            assignments.map((a) =>
              a._id === editingAssignment._id ? data.assignment : a
            )
          );
          setEditingAssignment(null);
          setNewAssignment({ propertyName: "", userId: "", startDate: "", endDate: "" });
        } else {
          alert("❌ " + (data.error || "Failed to save assignment."));
        }
      })
      .catch((err) => console.error("Error saving assignment:", err));
  };  
  
  // Handle Event Drag (Move Dates)
  const handleEventDrop = ({ event, start, end }) => {
    fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/assignments/${event._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ startDate: start, endDate: end }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAssignments(assignments.map((a) => (a._id === event._id ? { ...a, startDate: start, endDate: end } : a)));
        }
      })
      .catch((err) => console.error("Error updating assignment:", err));
  };

  // Handle Delete Assignment
  const handleDeleteAssignment = () => {
    if (!editingAssignment) return;

    if (!window.confirm("Are you sure you want to delete this assignment?")) return;

    fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/assignments/${editingAssignment._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          alert("✅ Assignment deleted successfully!");
          setAssignments(assignments.filter((a) => a._id !== editingAssignment._id));
          setEditingAssignment(null);
          setNewAssignment({ propertyName: "", userId: "", startDate: "", endDate: "" });
        } else {
          alert("❌ " + (data.error || "Failed to delete assignment."));
        }
      })
      .catch((err) => console.error("Error deleting assignment:", err));
  };

  // Handle Double Click (Edit Event)
  const handleEventDoubleClick = (event) => {
    console.log("Editing event:", event);
    setEditingAssignment(event);
    setNewAssignment({
      propertyName: event.title, // Ensure correct mapping
      userId: event.userId,
      startDate: moment(event.start).format("YYYY-MM-DDTHH:mm"),
      endDate: moment(event.end).format("YYYY-MM-DDTHH:mm"),
    });
  };
  

  // Map assignments into events
  const events = assignments.map((assignment) => {
    let startDate = new Date(assignment.startDate);
    let endDate = new Date(assignment.endDate);
  
    // Ensure event duration for month view (at least a full day)
    if (startDate.toDateString() === endDate.toDateString()) {
      endDate.setHours(endDate.getHours() + 1); // Extend by 1 hour
    }
  
    return {
      _id: assignment._id,
      title: assignment.propertyName,
      start: startDate,
      end: endDate,
      userId: assignment.userId,
    };
  });  

  return (
    <div className="scheduler-container">
      <button onClick={() => navigate("/dashboard")} className="return-button">
        ← Return to Dashboard
      </button>

      <h2 className="scheduler-title">Scheduler</h2>

      {/* Form Section */}
      <form onSubmit={handleSaveAssignment} className="assignment-form">
  <label>Property:</label>
  <select
    value={newAssignment.propertyName}
    onChange={(e) => setNewAssignment({ ...newAssignment, propertyName: e.target.value })}
    required
  >
    <option value="">Select Property</option>
    {properties.map((prop) => (
      <option key={prop.name} value={prop.name}>{prop.name}</option>
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
      <option key={user._id} value={user._id}>{user.email}</option>
    ))}
  </select>

  {/* ✅ Start Date */}
  <label>Start Date:</label>
  <input
    type="datetime-local"
    value={newAssignment.startDate || ""}
    onChange={(e) => setNewAssignment({ ...newAssignment, startDate: e.target.value })}
    required
  />

  {/* ✅ End Date */}
  <label>End Date:</label>
  <input
    type="datetime-local"
    value={newAssignment.endDate || ""}
    onChange={(e) => setNewAssignment({ ...newAssignment, endDate: e.target.value })}
    required
  />

  <button type="submit" className="create-button">
    {editingAssignment ? "Update Assignment" : "Create Assignment"}
  </button>

  {editingAssignment && (
    <button type="button" className="delete-button" onClick={handleDeleteAssignment}>
      Delete Assignment
    </button>
  )}
</form>

      <DndProvider backend={HTML5Backend}>
        <DnDCalendar localizer={localizer} events={events} startAccessor="start" endAccessor="end" onEventDrop={handleEventDrop} onSelectEvent={handleEventDoubleClick} />
      </DndProvider>
    </div>
  );
}

export default Scheduler;
