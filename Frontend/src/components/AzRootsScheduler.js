import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css"; 
import "react-big-calendar/lib/addons/dragAndDrop/styles.css"; 
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { apiUrl } from "../services/api";
import { HTML5Backend } from "react-dnd-html5-backend";
import { DndProvider } from "react-dnd";
import PageHeader from "./ui/PageHeader";
import ContextualHelpLink from "./help/ContextualHelpLink";

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

function AzRootsScheduler() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = location.state?.token || localStorage.getItem("token");
  const [assignments, setAssignments] = useState([]);
  const [properties, setProperties] = useState([]);
  const [users, setUsers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const role = localStorage.getItem("role");
  const orgName = localStorage.getItem("orgName");
  const [newAssignment, setNewAssignment] = useState({
    propertyName: "",
    userId: "",
    eventType: "",
    startDate: "",
    endDate: "",
    oneTimeCheckRequest: "", // New field for one-time request
  });

  const [editingAssignment, setEditingAssignment] = useState(null); // Holds event being edited

  useEffect(() => {
    if (role !== "admin" || orgName !== "AzRoots") {
      // Not an AzRoots admin? Kick them back.
      navigate("/scheduler");
    }
  }, [role, orgName, navigate]);

  // Fetch assignments
  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/assignments"), {
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
    fetch(apiUrl("/api/properties"), {
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
  
    fetch(apiUrl("/api/users?roles=all"), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.filter((user) => user.role === "user"));
        setContractors(data.filter((user) => user.role === "contractor"));
        setCleaners(data.filter((user) => user.role === "cleaner"));
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
  
    // 🔹 Check if eventType is empty before proceeding
  if (!newAssignment.eventType) {
    alert("❌ Error: Please select a Visit Type (QA Check, Maintenance, Cleaning).");
    return;
  }

    const url = editingAssignment
  ? apiUrl(`/api/assignments/${editingAssignment._id}`)
  : apiUrl("/api/assignments");

  
    const method = editingAssignment ? "PUT" : "POST";
  
    const storedOrgId = localStorage.getItem("organizationId");
    if (!storedOrgId) {
      console.error("❌ Missing organizationId. Ensure it is stored correctly in localStorage.");
      alert("❌ Error: Organization ID is missing.");
      return;
    }

    const effectiveEndDate = newAssignment.endDate || newAssignment.startDate;
    const formattedAssignment = {
      organizationId: storedOrgId,  
      propertyName: newAssignment.propertyName,
      userId: newAssignment.userId,
      eventType: newAssignment.eventType || "QA Check",
      startDate: new Date(newAssignment.startDate).toISOString(),
      endDate: new Date(effectiveEndDate).toISOString(),
      oneTimeCheckRequest: newAssignment.oneTimeCheckRequest, // Include this in the request
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
      if (data.success) {
        alert("✅ Assignment saved successfully!");
  
        // ✅ Refresh assignments immediately
        fetch(apiUrl("/api/assignments"), {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((updatedAssignments) => {
            setAssignments(updatedAssignments);
          })
          .catch((err) => console.error("❌ Error refreshing assignments:", err));
  
        setEditingAssignment(null);
        setNewAssignment({ propertyName: "", userId: "", eventType: "", startDate: "", endDate: "" });
  
        // ✅ Send push notification
        const notifResponse = await fetch(
          apiUrl("/api/send-push-notification"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              userId: newAssignment.userId,
              propertyName: newAssignment.propertyName,
            }),
          }
        );
  
        await notifResponse.json();
      } else {
        console.error("❌ Server error:", data);
        alert("❌ " + (data.error || "Failed to save assignment."));
      }
    } catch (err) {
      console.error("❌ Error saving assignment:", err);
    }
  };  
    
  
  // Handle Event Drag (Move Dates)
  const handleEventDrop = ({ event, start, end }) => {
    fetch(apiUrl(`/api/assignments/${event._id}`), {
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

    if (!window.confirm("Are you sure you want to cancel this assignment?")) return;

    fetch(apiUrl(`/api/assignments/${editingAssignment._id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          alert("✅ Assignment canceled successfully!");
          setAssignments(assignments.filter((a) => a._id !== editingAssignment._id));
          setEditingAssignment(null);
          setNewAssignment({ propertyName: "", userId: "", startDate: "", endDate: "" });
        } else {
          alert("❌ " + (data.error || "Failed to cancel assignment."));
        }
      })
      .catch((err) => console.error("Error deleting assignment:", err));
  };

  // Handle Double Click (Edit Event)
  const handleEventDoubleClick = (event) => {
    // Find matching property
    const matchedProperty = properties.find(prop => prop.name === event.title.split(" - ")[0]); 
    const propertyName = matchedProperty ? matchedProperty.name : event.title; // Fallback if not found
  
    const savedStartDate = event.assignmentStartDate || event.start;
    const savedEndDate = event.assignmentEndDate || event.end;
    const isSingleDay = moment(savedStartDate).isSame(moment(savedEndDate), "day");
    setEditingAssignment(event);
    setNewAssignment({
      propertyName: propertyName, // ✅ Ensure correct property is populated
      userId: event.userId,
      eventType: event.eventType || "",
      startDate: moment(savedStartDate).format("YYYY-MM-DD"),
      endDate: isSingleDay ? "" : moment(savedEndDate).format("YYYY-MM-DD"),
      oneTimeCheckRequest: event.oneTimeCheckRequest || "",
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
      assignmentStartDate: assignment.startDate,
      assignmentEndDate: assignment.endDate,
      eventType: assignment.eventType || "",
      userId: assignment.userId,
      oneTimeCheckRequest: assignment.oneTimeCheckRequest || "",
      allDay: true, // This flag tells react-big-calendar to treat this as an all-day event
    };
  });
  

  return (
    <div className="scheduler-container beta-scheduler-shell">
      <button onClick={() => navigate("/dashboard")} className="return-button">
        ← Return to Dashboard
      </button>

      <PageHeader
        eyebrow="Admin tools"
        title="Scheduler"
        subtitle="Coordinate quality checks, maintenance, and cleaning assignments."
        actions={<ContextualHelpLink slug="create-a-scheduler-assignment" />}
      />

      {/* Form Section */}
      <form onSubmit={handleSaveAssignment} className="assignment-form beta-scheduler-form">
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
 {/* ✅ Select Event Type */}
 <label>Visit Type:</label>
<select
  value={newAssignment.eventType} 
  onChange={(e) => setNewAssignment({ ...newAssignment, eventType: e.target.value })}
  required
>
  <option value="">Select Type</option> {/* User MUST pick one */}
  <option value="QA Check">QA Check</option>
  <option value="Maintenance">Maintenance</option>
  <option value="Cleaning">Cleaning</option>
</select>

  {/* ✅ Assign Users Based on Event Type */}
  <label>Assign To:</label>
        <select
          value={newAssignment.userId}
          onChange={(e) => setNewAssignment({ ...newAssignment, userId: e.target.value })}
          required
        >
          <option value="">Select User</option>
          {newAssignment.eventType === "QA Check" &&
            users.map(user => <option key={user._id} value={user._id}>{user.email}</option>)
          }
          {newAssignment.eventType === "Maintenance" &&
            contractors.map(user => <option key={user._id} value={user._id}>{user.email}</option>)
          }
          {newAssignment.eventType === "Cleaning" &&
            cleaners.map(user => <option key={user._id} value={user._id}>{user.email}</option>)
          }
        </select>

  {/* ✅ Start Date */}
  <label htmlFor="azroots-assignment-start-date">Start Date:</label>
<input
  id="azroots-assignment-start-date"
  type="date"
  value={newAssignment.startDate || ""}
  onChange={(e) => {
    const startDate = e.target.value;
    const endDate = newAssignment.endDate && newAssignment.endDate < startDate
      ? ""
      : newAssignment.endDate;
    setNewAssignment({ ...newAssignment, startDate, endDate });
  }}
  required
/>

<label htmlFor="azroots-assignment-end-date">End Date (optional):</label>
<div className="beta-scheduler-date-field">
  <input
    id="azroots-assignment-end-date"
    type="date"
    min={newAssignment.startDate || undefined}
    value={newAssignment.endDate || ""}
    onChange={(e) => setNewAssignment({ ...newAssignment, endDate: e.target.value })}
    aria-describedby="azroots-assignment-end-date-help"
  />
  <small id="azroots-assignment-end-date-help">Leave blank when the assignment must be completed on the start date.</small>
</div>
<label>One-Time Additional Check Request:</label>
<textarea
  value={newAssignment.oneTimeCheckRequest || ""}
  onChange={(e) =>
    setNewAssignment({ ...newAssignment, oneTimeCheckRequest: e.target.value })
  }
  placeholder="Enter any additional request for this specific assignment..."
/>
  <button type="submit" className="create-button">
    {editingAssignment ? "Update Assignment" : "Create Assignment"}
  </button>

  {editingAssignment && (
    <button type="button" className="delete-button" onClick={handleDeleteAssignment}>
      Cancel Assignment
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

export default AzRootsScheduler;
