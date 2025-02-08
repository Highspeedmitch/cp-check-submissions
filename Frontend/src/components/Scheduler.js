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
  const handleSaveAssignment = async (e) => {
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
  
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formattedAssignment),
      });
  
      const data = await response.json();
      console.log("📩 Server response:", data);
  
      if (data.success) {
        alert("✅ Assignment saved successfully!");
  
        // **Refresh assignments list after successful submission**
        fetch("https://cp-check-submissions-dev-backend.onrender.com/api/assignments", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((updatedAssignments) => {
            setAssignments(updatedAssignments); // **Update calendar immediately**
            console.log("📅 Assignments updated:", updatedAssignments);
          })
          .catch((err) => console.error("❌ Error refreshing assignments:", err));
  
        setEditingAssignment(null);
        setNewAssignment({ propertyName: "", userId: "", startDate: "", endDate: "" });
  
        console.log("📢 Sending push notification to user...");
  
        // **Trigger push notification**
        await fetch("https://cp-check-submissions-dev-backend.onrender.com/api/send-push-notification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: newAssignment.userId,
            propertyName: newAssignment.propertyName,
          }),
        })
          .then((notifRes) => notifRes.json())
          .then((notifData) => {
            console.log("📩 Push notification response:", notifData);
          })
          .catch((err) => console.error("❌ Error sending push notification:", err));
  
      } else {
        alert("❌ " + (data.error || "Failed to save assignment."));
      }
    } catch (err) {
      console.error("❌ Error saving assignment:", err);
    }
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
    
    // Find matching property
    const matchedProperty = properties.find(prop => prop.name === event.title.split(" - ")[0]); 
    const propertyName = matchedProperty ? matchedProperty.name : event.title; // Fallback if not found
  
    setEditingAssignment(event);
    setNewAssignment({
      propertyName: propertyName, // ✅ Ensure correct property is populated
      userId: event.userId,
      startDate: moment(event.start).format("YYYY-MM-DDTHH:mm"),
      endDate: moment(event.end).format("YYYY-MM-DDTHH:mm"),
    });
  };

  // Map assignments into events
const events = assignments.map((assignment) => {
    // Convert stored ISO dates to Date objects
    let startDate = new Date(assignment.startDate);
    let endDate = new Date(assignment.endDate);
  
    // If the event is date-only and the start and end are the same,
    // adjust the end date to be the next day so the event spans the whole day.
    if (startDate.toDateString() === endDate.toDateString()) {
      // Create a new date object based on the start date and add one day.
      const adjustedEndDate = new Date(startDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
      endDate = adjustedEndDate;
    }
  
    // Find user email by ID
    const assignedUser = users.find(user => user._id === assignment.userId);
    const assignedUserEmail = assignedUser ? assignedUser.email : "Unknown User";
  
    return {
      _id: assignment._id,
      title: `${assignment.propertyName} - ${assignedUserEmail}`,
      start: startDate,
      end: endDate,
      userId: assignment.userId,
      allDay: true, // This flag tells react-big-calendar to treat this as an all-day event
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
  type="date"
  value={newAssignment.startDate || ""}
  onChange={(e) => setNewAssignment({ ...newAssignment, startDate: e.target.value })}
  required
/>

<label>End Date:</label>
<input
  type="date"
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
      <DnDCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            views={["month", "week", "agenda"]}
            style={{ height: "500px", width: "100%" }}
            onEventDrop={handleEventDrop}
            onSelectEvent={handleEventDoubleClick}
          />
      </DndProvider>
    </div>
  );
}

export default Scheduler;
