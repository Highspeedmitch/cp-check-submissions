import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import moment from "moment";
import { apiUrl } from "../services/api";
import PageHeader from "./ui/PageHeader";
import ContextualHelpLink from "./help/ContextualHelpLink";
import {
  propertySuggestedAmount,
  schedulerAssigneeLabel,
  schedulerFulfillmentSources,
  schedulerUserMatchesFulfillment,
  shouldShowSuggestedClientAmount,
  showAfterlightQueue,
} from "../services/schedulerPresentation";
import AssignmentHistoryDialog from "./scheduler/AssignmentHistoryDialog";
import SchedulerCalendar from "./scheduler/SchedulerCalendar";
import {
  assignmentFormDatesFromStored,
  assignmentDatesFromCalendarDrop,
  assignmentDatesFromCalendarSelection,
  calendarEventDatesFromAssignment,
} from "../services/schedulerDates";

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
  assignmentType: "property",
  propertyName: "",
  routeId: "",
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
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [fulfillmentSettings, setFulfillmentSettings] = useState(null);
  const [newAssignment, setNewAssignment] = useState(EMPTY_ASSIGNMENT);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const propertySelectRef = useRef(null);

  const [editingAssignment, setEditingAssignment] = useState(null); // Holds event being edited

  useEffect(() => {
    if (!editorOpen) return undefined;
    const focusTimer = window.setTimeout(() => propertySelectRef.current?.focus(), 0);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setEditorOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [editorOpen]);

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

  // Fetch active, ordered routes available to this administrator or property manager.
  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/service-routes"), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setRoutes(data.routes || []))
      .catch((err) => console.error("Error fetching routes:", err));
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
  const selectedRoute = routes.find((route) => String(route._id) === String(newAssignment.routeId))
    || (editingAssignment?.routeRunId ? {
      _id: editingAssignment.routeId,
      name: editingAssignment.routeName,
      propertyIds: (editingAssignment.routeStops || []).map((stop) => stop.propertyId),
      properties: editingAssignment.routeStops || [],
    } : null);
  const selectedRouteProperties = (selectedRoute?.propertyIds || []).map((propertyId) =>
    properties.find((property) => String(property._id) === String(propertyId))
      || (selectedRoute?.properties || []).find((property) => String(property.propertyId || property._id) === String(propertyId))
  ).filter(Boolean);
  const targetProperties = newAssignment.assignmentType === "route"
    ? selectedRouteProperties
    : selectedProperty ? [selectedProperty] : [];
  const routeDefaultSources = [...new Set(selectedRouteProperties.map((property) =>
    property.fulfillment?.resolvedSource
      || fulfillmentSettings?.organization?.defaultSource
      || "customer_employee"
  ))];
  const mixedRouteDefaults = newAssignment.assignmentType === "route"
    && !newAssignment.fulfillmentSource
    && !editingAssignment
    && routeDefaultSources.length > 1;
  const savedEditingSource = editingAssignment?.fulfillment?.source;
  const effectiveFulfillmentSource = newAssignment.fulfillmentSource
    || savedEditingSource
    || routeDefaultSources[0]
    || selectedProperty?.fulfillment?.resolvedSource
    || fulfillmentSettings?.organization?.defaultSource
    || "customer_employee";
  const effectivePolicy = SOURCE_POLICIES[effectiveFulfillmentSource] || SOURCE_POLICIES.customer_employee;
  const availableFulfillmentSources = schedulerFulfillmentSources(fulfillmentSettings);
  const eligibleUsers = users.filter((user) => {
    const isAfterlightResource = user.accountScope === "afterlight_resource";
    const scopedPropertyIds = (user.propertyIds || []).map(String);
    const coversTargets = !targetProperties.length
      || user.scopeMode === "all"
      || (!isAfterlightResource && user.workScopeConfigured === false && !scopedPropertyIds.length)
      || targetProperties.every((property) => scopedPropertyIds.includes(String(property._id)));
    if (!coversTargets || mixedRouteDefaults) return false;
    if (!["afterlight_staff", "afterlight_contractor"].includes(effectiveFulfillmentSource)) {
      return !isAfterlightResource
        && schedulerUserMatchesFulfillment(user, effectiveFulfillmentSource);
    }
    if (!isAfterlightResource) return false;
    if (effectiveFulfillmentSource === "afterlight_contractor" && user.resourceType !== "contractor") return false;
    if (effectiveFulfillmentSource === "afterlight_staff" && user.resourceType === "contractor") return false;
    return true;
  });
  const retainedEditingAssignee = editingAssignment
    && newAssignment.userId
    && !eligibleUsers.some((user) => String(user._id) === String(newAssignment.userId))
    ? {
        _id: newAssignment.userId,
        label: editingAssignment.assignee?.email
          || editingAssignment.assignee?.name
          || (["afterlight_staff", "afterlight_contractor"].includes(savedEditingSource)
            ? "Previously assigned Afterlight resource"
            : "Previously assigned user"),
      }
    : null;

  // Handle form submission (New or Editing)
  const handleSaveAssignment = async (e) => {
    e.preventDefault();
    if (!token) {
      setFeedback({ type: "error", message: "Your session has expired. Please sign in again." });
      return;
    }
  
    const routeAssignment = newAssignment.assignmentType === "route";
    const url = editingAssignment
      ? apiUrl(editingAssignment.routeRunId
        ? `/api/route-runs/${editingAssignment.routeRunId}`
        : `/api/assignments/${editingAssignment._id}`)
      : apiUrl(routeAssignment ? "/api/route-runs" : "/api/assignments");
  
    const method = editingAssignment ? "PUT" : "POST";
  
    const storedOrgId = localStorage.getItem("organizationId");
    if (!storedOrgId) {
      setFeedback({ type: "error", message: "The organization could not be identified. Please sign in again." });
      return;
    }

    const effectiveEndDate = newAssignment.endDate || newAssignment.startDate;
    const formattedAssignment = {
      organizationId: storedOrgId,  
      ...(routeAssignment
        ? { routeId: newAssignment.routeId }
        : { propertyName: newAssignment.propertyName }),
      userId: newAssignment.userId,
      startDate: new Date(newAssignment.startDate).toISOString(),
      endDate: new Date(effectiveEndDate).toISOString(),
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
        setFeedback({
          type: "success",
          message: editingAssignment
            ? routeAssignment ? "ROUTE assignment updated." : "Assignment updated."
            : routeAssignment ? `ROUTE assignment created with ${selectedRouteProperties.length} stops.` : "Assignment created.",
        });

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
        setEditorOpen(false);
      } else {
        setFeedback({ type: "error", message: data.error || "Failed to save assignment." });
      }
    } catch (err) {
      console.error("Error saving assignment:", err);
      setFeedback({ type: "error", message: "The assignment could not be saved. Please try again." });
    }
  };  
    
  
  // Handle Event Drag (Move Dates)
  const handleEventDrop = ({ event, start, end }) => {
    const dates = assignmentDatesFromCalendarDrop(start, end);
    const groupedRoute = Boolean(event.routeRunId);
    fetch(apiUrl(groupedRoute
      ? `/api/route-runs/${event.routeRunId}`
      : `/api/assignments/${event._id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(dates),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAssignments((current) => current.map((assignment) => (
            (groupedRoute
              ? String(assignment.routeRunId) === String(event.routeRunId)
              : assignment._id === event._id)
              ? { ...assignment, startDate: dates.startDate, endDate: dates.endDate }
              : assignment
          )));
          setFeedback({ type: "success", message: groupedRoute
            ? "ROUTE assignment moved to the selected date."
            : "Assignment moved to the selected date." });
        } else {
          setFeedback({ type: "error", message: data.error || "The assignment could not be moved." });
        }
      })
      .catch((err) => {
        console.error("Error updating assignment:", err);
        setFeedback({ type: "error", message: "The assignment could not be moved." });
      });
  };

  // Handle Delete Assignment
  const handleDeleteAssignment = () => {
    if (!editingAssignment) return;

    const groupedRoute = Boolean(editingAssignment.routeRunId);
    if (!window.confirm(groupedRoute
      ? `Cancel the entire ROUTE assignment and all ${editingAssignment.routeStopCount} stops?`
      : "Are you sure you want to cancel this assignment?")) return;

    fetch(apiUrl(groupedRoute
      ? `/api/route-runs/${editingAssignment.routeRunId}`
      : `/api/assignments/${editingAssignment._id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAssignments((current) => current.filter((assignment) => groupedRoute
            ? String(assignment.routeRunId) !== String(editingAssignment.routeRunId)
            : assignment._id !== editingAssignment._id));
          setEditingAssignment(null);
          setNewAssignment(EMPTY_ASSIGNMENT);
          setEditorOpen(false);
          setFeedback({ type: "success", message: groupedRoute
            ? "ROUTE assignment canceled."
            : "Assignment canceled." });
        } else {
          setFeedback({ type: "error", message: data.error || "Failed to cancel assignment." });
        }
      })
      .catch((err) => {
        console.error("Error deleting assignment:", err);
        setFeedback({ type: "error", message: "The assignment could not be canceled." });
      });
  };

  const openAssignmentHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(apiUrl("/api/assignments/history"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Unable to load assignment history.");
      setAssignmentHistory(await response.json());
    } catch (error) {
      setHistoryError(error.message || "Unable to load assignment history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const openAssignment = (event) => {
    const savedStartDate = event.assignmentStartDate || event.start;
    const savedEndDate = event.assignmentEndDate || event.end;
    const formDates = assignmentFormDatesFromStored(savedStartDate, savedEndDate);
    setEditingAssignment(event);
    setNewAssignment({
      assignmentType: event.routeRunId ? "route" : "property",
      propertyName: event.routeRunId ? "" : event.propertyName || event.title.split(" - ")[0],
      routeId: event.routeId || "",
      userId: event.userId,
      ...formDates,
      oneTimeCheckRequest: event.oneTimeCheckRequest || "",
      fulfillmentSource: "",
      fulfillmentOverrideReason: "",
    });
    setFeedback(null);
    setEditorOpen(true);
  };

  const openNewAssignment = (dates = {}) => {
    setEditingAssignment(null);
    setNewAssignment({ ...EMPTY_ASSIGNMENT, ...dates });
    setFeedback(null);
    setEditorOpen(true);
  };

  const handleCalendarSelection = ({ start, end }) => {
    openNewAssignment(assignmentDatesFromCalendarSelection(start, end));
  };

  const queueForAssignment = (assignment) => assignment.fulfillment?.queue
    || SOURCE_POLICIES[fulfillmentSettings?.organization?.defaultSource]?.queue
    || "afterlight_coverage";
  const serviceModel = fulfillmentSettings?.organization?.serviceModel;

  const eventForAssignment = (assignment, routeChildren = null) => {
    const calendarDates = calendarEventDatesFromAssignment(assignment.startDate, assignment.endDate);
    const assignedUser = users.find((user) => String(user._id) === String(assignment.userId));
    const assignedUserEmail = assignedUser?.email
      || assignment.assignee?.email
      || assignment.assignee?.name
      || "Unknown User";
    const children = routeChildren || [assignment];
    const routeStopCount = assignment.routeStopCount || children.length;
    const routeLabel = assignment.routeRunId
      ? `ROUTE: ${assignment.routeName || "Route"} (${routeStopCount} stops)`
      : assignment.propertyName;
    return {
      _id: assignment.routeRunId ? `route-${assignment.routeRunId}` : assignment._id,
      title: `${routeLabel} - ${assignedUserEmail}`,
      propertyName: routeLabel,
      routeName: assignment.routeName || "",
      routeRunId: assignment.routeRunId || "",
      routeId: assignment.routeId || "",
      routeStopCount,
      routeStops: children
        .slice()
        .sort((first, second) => (first.routeStopIndex || 0) - (second.routeStopIndex || 0))
        .map((child) => ({
          assignmentId: child._id,
          propertyId: child.propertyId,
          propertyName: child.propertyName,
          stopIndex: child.routeStopIndex || 0,
        })),
      assigneeLabel: assignedUserEmail,
      start: calendarDates.start,
      end: calendarDates.end,
      assignmentStartDate: assignment.startDate,
      assignmentEndDate: assignment.endDate,
      userId: assignment.userId,
      oneTimeCheckRequest: assignment.oneTimeCheckRequest || "",
      fulfillment: assignment.fulfillment || null,
      assignee: assignment.assignee || null,
      tone: assignment.fulfillment?.source === "legacy"
        ? "legacy"
        : queueForAssignment(assignment) === "afterlight_coverage" ? "afterlight" : "customer",
      allDay: true, // This flag tells react-big-calendar to treat this as an all-day event
    };
  };

  // A route run persists as normal per-property assignments, but appears as one
  // clearly labeled calendar event and is edited/canceled as a group.
  const seenRouteRuns = new Set();
  const events = [];
  assignments.forEach((assignment) => {
    if (!assignment.routeRunId) {
      events.push(eventForAssignment(assignment));
      return;
    }
    const routeRunId = String(assignment.routeRunId);
    if (seenRouteRuns.has(routeRunId)) return;
    seenRouteRuns.add(routeRunId);
    const routeChildren = assignments.filter((candidate) =>
      String(candidate.routeRunId || "") === routeRunId
    );
    events.push(eventForAssignment(assignment, routeChildren));
  });

  const customerAssignments = assignments.filter((assignment) => queueForAssignment(assignment) === "customer_assigned");
  const afterlightAssignments = assignments.filter((assignment) => queueForAssignment(assignment) === "afterlight_coverage");
  const hasAfterlightQueue = showAfterlightQueue(serviceModel, afterlightAssignments.length);
  

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
        {hasAfterlightQueue && (
          <div className="beta-fulfillment-queue afterlight">
            <span>{serviceModel === "platform" ? "Retained Afterlight Work" : "Afterlight Coverage"}</span>
            <strong>{afterlightAssignments.length}</strong>
            <small>{serviceModel === "platform"
              ? "Assignments created before the SaaS transition"
              : "Afterlight staff and contractor coverage"}</small>
          </div>
        )}
      </section>

      {feedback && !editorOpen && <p className={`beta-alert ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
        {feedback.message}
      </p>}

      <SchedulerCalendar
        events={events}
        onEventDrop={handleEventDrop}
        onSelectEvent={openAssignment}
        onSelectSlot={handleCalendarSelection}
        onNewAssignment={() => openNewAssignment()}
        onHistory={openAssignmentHistory}
        showHistory
        legend={[
          { tone: "customer", label: "Customer assigned" },
          ...(hasAfterlightQueue ? [{ tone: "afterlight", label: "Afterlight coverage" }] : []),
          ...(events.some((event) => event.tone === "legacy") ? [{ tone: "legacy", label: "Retained assignment" }] : []),
        ]}
      />

      {editorOpen && <div className="beta-scheduler-editor-overlay"
        onMouseDown={(event) => event.target === event.currentTarget && setEditorOpen(false)}>
        <section className="beta-scheduler-editor" role="dialog" aria-modal="true"
          aria-labelledby="assignment-editor-title">
          <div className="beta-scheduler-editor-header">
            <div>
              <span className="beta-eyebrow">{editingAssignment
                ? editingAssignment.routeRunId ? "Scheduled ROUTE assignment" : "Scheduled assignment"
                : "New assignment"}</span>
              <h2 id="assignment-editor-title">{editingAssignment
                ? editingAssignment.routeRunId ? "Edit ROUTE assignment" : "Edit assignment"
                : "Create assignment"}</h2>
              <p>{newAssignment.startDate
                ? `Scheduled for ${moment(newAssignment.startDate).format("MMMM D, YYYY")}`
                : "Choose the property, assignee, and schedule."}</p>
            </div>
            <button type="button" className="beta-dialog-close" aria-label="Close assignment editor"
              onClick={() => setEditorOpen(false)}>×</button>
          </div>

          {feedback && <p className={`beta-alert ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
            {feedback.message}
          </p>}

      <form onSubmit={handleSaveAssignment} className="assignment-form beta-scheduler-form beta-scheduler-editor-form">
  <label>Assignment type:</label>
  <div className="beta-scheduler-assignment-type" role="group" aria-label="Assignment type">
    <button type="button" className={newAssignment.assignmentType === "property" ? "active" : ""}
      disabled={Boolean(editingAssignment)}
      onClick={() => setNewAssignment({ ...EMPTY_ASSIGNMENT, assignmentType: "property", startDate: newAssignment.startDate, endDate: newAssignment.endDate })}>
      Property
    </button>
    <button type="button" className={newAssignment.assignmentType === "route" ? "active" : ""}
      disabled={Boolean(editingAssignment) || !routes.length}
      onClick={() => setNewAssignment({ ...EMPTY_ASSIGNMENT, assignmentType: "route", startDate: newAssignment.startDate, endDate: newAssignment.endDate })}>
      Route
    </button>
  </div>

  {newAssignment.assignmentType === "route" ? <>
    <label htmlFor="assignment-route">Route:</label>
    <select
      id="assignment-route"
      ref={propertySelectRef}
      value={newAssignment.routeId}
      disabled={Boolean(editingAssignment)}
      onChange={(e) => setNewAssignment({ ...newAssignment, routeId: e.target.value, userId: "", fulfillmentSource: "", fulfillmentOverrideReason: "" })}
      required
    >
      <option value="">Select Route</option>
      {routes.map((route) => (
        <option key={route._id} value={route._id}>{route.name} ({(route.propertyIds || []).length} stops)</option>
      ))}
      {editingAssignment?.routeRunId && !routes.some((route) => String(route._id) === String(newAssignment.routeId)) && (
        <option value={newAssignment.routeId}>{editingAssignment.routeName} ({editingAssignment.routeStopCount} stops)</option>
      )}
    </select>
  </> : <>
    <label htmlFor="assignment-property">Property:</label>
    <select
      id="assignment-property"
      ref={propertySelectRef}
      value={newAssignment.propertyName}
      disabled={Boolean(editingAssignment?.routeRunId)}
      onChange={(e) => setNewAssignment({ ...newAssignment, propertyName: e.target.value, userId: "", fulfillmentSource: "", fulfillmentOverrideReason: "" })}
      required
    >
      <option value="">Select Property</option>
      {properties.map((prop) => (
        <option key={prop.name} value={prop.name}>{prop.name}</option>
      ))}
    </select>
  </>}

  {selectedRoute && <div className="beta-route-assignment-preview">
    <strong>ROUTE assignment · {selectedRouteProperties.length} stops</strong>
    <ol>{selectedRouteProperties.map((property, index) => <li key={property._id || property.propertyId}>
      <span>{index + 1}</span>{property.name || property.propertyName}
    </li>)}</ol>
    <small>One grouped notification and calendar entry will be created. Pricing and pay remain per property.</small>
  </div>}

  {mixedRouteDefaults && <p className="beta-alert notice">
    This route's properties use different fulfillment defaults. Choose one fulfillment option for this route assignment.
  </p>}

  <label>Fulfillment:</label>
  <select
    value={newAssignment.fulfillmentSource}
    disabled={Boolean(editingAssignment?.routeRunId)}
    onChange={(e) => setNewAssignment({ ...newAssignment, userId: "", fulfillmentSource: e.target.value })}
  >
    <option value="">
      {editingAssignment
        ? `Keep saved choice (${FULFILLMENT_LABELS[savedEditingSource] || FULFILLMENT_LABELS[effectiveFulfillmentSource]})`
        : `Use property default (${FULFILLMENT_LABELS[effectiveFulfillmentSource]})`}
    </option>
    {availableFulfillmentSources.map((value) => (
      <option key={value} value={value}>{FULFILLMENT_LABELS[value]}</option>
    ))}
  </select>

  <label>Assignee:</label>
  <select
    value={newAssignment.userId}
    disabled={Boolean(editingAssignment?.routeRunId)}
    onChange={(e) => setNewAssignment({ ...newAssignment, userId: e.target.value })}
    required
  >
    <option value="">Select matching field operator</option>
    {retainedEditingAssignee && (
      <option value={retainedEditingAssignee._id}>
        {retainedEditingAssignee.label} (existing assignment)
      </option>
    )}
    {eligibleUsers.map((user) => (
      <option key={user._id} value={user._id}>
        {schedulerAssigneeLabel(user)}
      </option>
    ))}
  </select>

  <label>Routing:</label>
  <div className="beta-assignment-routing-preview">
    <strong>{effectivePolicy.queue === "afterlight_coverage" ? "Afterlight Coverage" : "Customer Assigned"}</strong>
    <span>{effectivePolicy.invoiceLabel}</span>
  </div>

  {shouldShowSuggestedClientAmount(effectivePolicy) && (
    <>
      <label>Suggested client amount:</label>
      <div className="beta-assignment-routing-preview">
        <strong>{newAssignment.assignmentType === "route"
          ? selectedRouteProperties.length
            ? selectedRouteProperties.map((property) => `${property.name}: ${propertySuggestedAmount(property)}`).join(" · ")
            : "Select a route"
          : selectedProperty ? propertySuggestedAmount(selectedProperty) : "Select a property"}</strong>
        <span>{newAssignment.assignmentType === "route" ? "Per-property billing settings" : "Property billing setting"}</span>
      </div>
    </>
  )}

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
  <label htmlFor="assignment-start-date">Start Date:</label>
<input
  id="assignment-start-date"
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

<label htmlFor="assignment-end-date">End Date (optional):</label>
<div className="beta-scheduler-date-field">
  <input
    id="assignment-end-date"
    type="date"
    min={newAssignment.startDate || undefined}
    value={newAssignment.endDate || ""}
    onChange={(e) => setNewAssignment({ ...newAssignment, endDate: e.target.value })}
    aria-describedby="assignment-end-date-help"
  />
  <small id="assignment-end-date-help">Leave blank when the assignment must be completed on the start date.</small>
</div>
<label>One-Time Additional Check Request:</label>
<textarea
  value={newAssignment.oneTimeCheckRequest || ""}
  onChange={(e) =>
    setNewAssignment({ ...newAssignment, oneTimeCheckRequest: e.target.value })
  }
  placeholder="Enter any additional request for this specific assignment..."
/>
  <div className="beta-scheduler-actions">
    <button type="submit" className="create-button">
      {editingAssignment
        ? editingAssignment.routeRunId ? "Update ROUTE Assignment" : "Update Assignment"
        : newAssignment.assignmentType === "route" ? "Create ROUTE Assignment" : "Create Assignment"}
    </button>
    <button type="button" className="history-button" onClick={() => setEditorOpen(false)}>
      Close
    </button>
    {editingAssignment && (
      <button type="button" className="delete-button" onClick={handleDeleteAssignment}>
        {editingAssignment.routeRunId ? "Cancel Entire ROUTE" : "Cancel Assignment"}
      </button>
    )}
  </div>
</form>
        </section>
      </div>}

      {historyOpen && (
        <AssignmentHistoryDialog
          assignments={assignmentHistory}
          loading={historyLoading}
          error={historyError}
          onClose={() => setHistoryOpen(false)}
        />
      )}

    </div>
  );
}

export default Scheduler;
