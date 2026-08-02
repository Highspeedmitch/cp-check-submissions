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

const FULFILLMENT_LABELS = {
  customer_employee: "Customer employee",
  customer_contractor: "Customer contractor",
  afterlight_staff: "Afterlight staff",
  afterlight_contractor: "Afterlight contractor",
  legacy: "Legacy assignment",
};

const SOURCE_POLICIES = {
  customer_employee: { queue: "customer_assigned", invoiceRequired: false, invoiceLabel: "No invoice" },
  customer_contractor: { queue: "customer_assigned", invoiceRequired: true, invoiceLabel: "Customer accounts payable" },
  afterlight_staff: { queue: "afterlight_coverage", invoiceRequired: true, invoiceLabel: "Afterlight service billing" },
  afterlight_contractor: { queue: "afterlight_coverage", invoiceRequired: true, invoiceLabel: "Afterlight service billing" },
};

const EMPTY_ASSIGNMENT = {
  propertyName: "",
  userId: "",
  startDate: "",
  endDate: "",
  oneTimeCheckRequest: "",
  fulfillmentSource: "",
  fulfillmentOverrideReason: "",
};

function Scheduler() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = location.state?.token || localStorage.getItem("token");

  const [assignments, setAssignments] = useState([]);
  const [properties, setProperties] = useState([]);
  const [users, setUsers] = useState([]);
  const [fulfillmentSettings, setFulfillmentSettings] = useState(null);
  const [newAssignment, setNewAssignment] = useState(EMPTY_ASSIGNMENT);

  const [editingAssignment, setEditingAssignment] = useState(null); // Holds event being edited

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
        const filteredUsers = data.filter(user => user.role !== "admin");
        setUsers(filteredUsers);
      })
      .catch((err) => console.error("Error fetching users:", err));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/fulfillment"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(setFulfillmentSettings)
      .catch((err) => console.error("Error fetching fulfillment settings:", err));
  }, [token]);

  const selectedProperty = properties.find((property) => property.name === newAssignment.propertyName);
  const savedEditingSource = editingAssignment?.fulfillment?.source;
  const effectiveFulfillmentSource = newAssignment.fulfillmentSource
    || savedEditingSource
    || selectedProperty?.fulfillment?.resolvedSource
    || fulfillmentSettings?.organization?.defaultSource
    || "afterlight_staff";
  const effectivePolicy = SOURCE_POLICIES[effectiveFulfillmentSource] || SOURCE_POLICIES.afterlight_staff;
  const eligibleUsers = users.filter((user) => {
    const isAfterlightResource = user.accountScope === "afterlight_resource";
    if (effectiveFulfillmentSource !== "afterlight_contractor") return !isAfterlightResource;
    if (!isAfterlightResource) return false;
    if (!selectedProperty || !(user.propertyIds || []).length) return true;
    return user.propertyIds.map(String).includes(String(selectedProperty._id));
  });

  // Handle form submission (New or Editing)
  const handleSaveAssignment = async (e) => {
    e.preventDefault();
    if (!token) {
      alert("Unauthorized. Please log in again.");
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

    const formattedAssignment = {
      organizationId: storedOrgId,  
      propertyName: newAssignment.propertyName,
      userId: newAssignment.userId,
      startDate: new Date(newAssignment.startDate).toISOString(),
      endDate: new Date(newAssignment.endDate).toISOString(),
      oneTimeCheckRequest: newAssignment.oneTimeCheckRequest, // Include this in the request
    };
    if (newAssignment.fulfillmentSource) {
      formattedAssignment.fulfillmentSource = newAssignment.fulfillmentSource;
      formattedAssignment.fulfillmentOverrideReason = newAssignment.fulfillmentOverrideReason;
    }
  
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
        setNewAssignment(EMPTY_ASSIGNMENT);
  
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

    if (!window.confirm("Are you sure you want to delete this assignment?")) return;

    fetch(apiUrl(`/api/assignments/${editingAssignment._id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          alert("✅ Assignment deleted successfully!");
          setAssignments(assignments.filter((a) => a._id !== editingAssignment._id));
          setEditingAssignment(null);
          setNewAssignment(EMPTY_ASSIGNMENT);
        } else {
          alert("❌ " + (data.error || "Failed to delete assignment."));
        }
      })
      .catch((err) => console.error("Error deleting assignment:", err));
  };

  // Handle Double Click (Edit Event)
  const handleEventDoubleClick = (event) => {
    // Find matching property
    const matchedProperty = properties.find(prop => prop.name === event.title.split(" - ")[0]); 
    const propertyName = matchedProperty ? matchedProperty.name : event.title; // Fallback if not found
  
    setEditingAssignment(event);
    setNewAssignment({
      propertyName: propertyName, // ✅ Ensure correct property is populated
      userId: event.userId,
      startDate: moment(event.start).format("YYYY-MM-DDTHH:mm"),
      endDate: moment(event.end).format("YYYY-MM-DDTHH:mm"),
      oneTimeCheckRequest: event.oneTimeCheckRequest || "",
      fulfillmentSource: "",
      fulfillmentOverrideReason: "",
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
      oneTimeCheckRequest: assignment.oneTimeCheckRequest || "",
      fulfillment: assignment.fulfillment || null,
      allDay: true, // This flag tells react-big-calendar to treat this as an all-day event
    };
  });

  const queueForAssignment = (assignment) => assignment.fulfillment?.queue
    || SOURCE_POLICIES[fulfillmentSettings?.organization?.defaultSource]?.queue
    || "afterlight_coverage";
  const customerAssignments = assignments.filter((assignment) => queueForAssignment(assignment) === "customer_assigned");
  const afterlightAssignments = assignments.filter((assignment) => queueForAssignment(assignment) === "afterlight_coverage");
  

  return (
    <div className="scheduler-container beta-scheduler-shell">
      <button onClick={() => navigate("/dashboard")} className="return-button">
        ← Return to Dashboard
      </button>

      <PageHeader
        eyebrow="Admin tools"
        title="Scheduler"
        subtitle="Create assignments and review upcoming property work."
        actions={<ContextualHelpLink slug="create-a-scheduler-assignment" />}
      />

      <section className="beta-fulfillment-queues" aria-label="Fulfillment queues">
        <div className="beta-fulfillment-queue customer">
          <span>Customer Assigned</span>
          <strong>{customerAssignments.length}</strong>
          <small>Customer employees and contractors</small>
        </div>
        <div className="beta-fulfillment-queue afterlight">
          <span>Afterlight Coverage</span>
          <strong>{afterlightAssignments.length}</strong>
          <small>Afterlight staff and contractor coverage</small>
        </div>
      </section>

      {/* Form Section */}
      <form onSubmit={handleSaveAssignment} className="assignment-form beta-scheduler-form">
  <label>Property:</label>
  <select
    value={newAssignment.propertyName}
    onChange={(e) => setNewAssignment({ ...newAssignment, propertyName: e.target.value, userId: "", fulfillmentSource: "", fulfillmentOverrideReason: "" })}
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
    {eligibleUsers.map((user) => (
      <option key={user._id} value={user._id}>
        {user.displayName || user.email} ({user.accountScope === "afterlight_resource" ? `Afterlight contractor · ${(user.rateCents / 100).toLocaleString("en-US", { style: "currency", currency: user.currency || "USD" })}` : user.role})
      </option>
    ))}
  </select>

  <label>Fulfillment:</label>
  <select
    value={newAssignment.fulfillmentSource}
    onChange={(e) => setNewAssignment({ ...newAssignment, userId: "", fulfillmentSource: e.target.value })}
  >
    <option value="">
      {editingAssignment
        ? `Keep saved choice (${FULFILLMENT_LABELS[savedEditingSource] || FULFILLMENT_LABELS[effectiveFulfillmentSource]})`
        : `Use property default (${FULFILLMENT_LABELS[effectiveFulfillmentSource]})`}
    </option>
    {Object.entries(FULFILLMENT_LABELS).filter(([value]) => value !== "legacy").map(([value, label]) => (
      <option key={value} value={value}>{label}</option>
    ))}
  </select>

  <label>Routing:</label>
  <div className="beta-assignment-routing-preview">
    <strong>{effectivePolicy.queue === "afterlight_coverage" ? "Afterlight Coverage" : "Customer Assigned"}</strong>
    <span>{effectivePolicy.invoiceLabel}</span>
  </div>

  {newAssignment.fulfillmentSource && (
    <>
      <label>Override note:</label>
      <input
        type="text"
        value={newAssignment.fulfillmentOverrideReason}
        onChange={(e) => setNewAssignment({ ...newAssignment, fulfillmentOverrideReason: e.target.value })}
        placeholder="Optional reason for this assignment"
      />
    </>
  )}

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
