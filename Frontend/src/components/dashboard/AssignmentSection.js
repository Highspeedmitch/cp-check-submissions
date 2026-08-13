import React, { useMemo, useState } from "react";
import {
  ASSIGNMENT_VIEWS,
  assignmentDateRangeLabel,
  assignmentTimingLabel,
  assignmentUrgency,
  buildAssignmentQueue,
} from "../../services/assignmentUrgency";
import AssignmentQueueControls, { assignmentEmptyMessage } from "./AssignmentQueueControls";

function groupAssignments(assignments) {
  const groups = [];
  const routeGroups = new Map();
  assignments.forEach((assignment) => {
    if (!assignment.routeRunId) {
      groups.push({ type: "property", assignments: [assignment] });
      return;
    }
    const routeRunId = String(assignment.routeRunId);
    if (!routeGroups.has(routeRunId)) {
      const group = { type: "route", routeRunId, assignments: [] };
      routeGroups.set(routeRunId, group);
      groups.push(group);
    }
    routeGroups.get(routeRunId).assignments.push(assignment);
  });
  routeGroups.forEach((group) => group.assignments.sort(
    (first, second) => (first.routeStopIndex || 0) - (second.routeStopIndex || 0)
  ));
  return groups;
}

function AssignmentSection({ assignments, properties, onOpenProperty, onNavigate }) {
  const [activeView, setActiveView] = useState(ASSIGNMENT_VIEWS.ATTENTION);
  const assignmentQueue = useMemo(() => buildAssignmentQueue(assignments), [assignments]);
  const groupedAssignments = useMemo(
    () => groupAssignments(assignmentQueue[activeView]),
    [activeView, assignmentQueue]
  );
  const counts = {
    [ASSIGNMENT_VIEWS.ATTENTION]: assignmentQueue[ASSIGNMENT_VIEWS.ATTENTION].length,
    [ASSIGNMENT_VIEWS.UPCOMING]: assignmentQueue[ASSIGNMENT_VIEWS.UPCOMING].length,
    [ASSIGNMENT_VIEWS.ALL]: assignmentQueue[ASSIGNMENT_VIEWS.ALL].length,
  };

  return (
    <section className="beta-section">
      <div className="beta-section-heading">
        <div>
          <h2>My Assignments</h2>
          <p>Prioritize scheduled property work by its due date.</p>
        </div>
      </div>
      <AssignmentQueueControls activeView={activeView} counts={counts} onChange={setActiveView} />
      {groupedAssignments.length ? <div className="beta-assignment-grid" role="tabpanel">
        {groupedAssignments.map((group) => {
          const assignment = group.assignments[0];
          const urgency = assignmentUrgency(assignment);
          if (group.type === "route") {
            return (
              <article className={`beta-assignment-card beta-route-work-card is-${urgency}`} key={group.routeRunId}>
                <div className="beta-card-header">
                  <div>
                    <span className="beta-eyebrow">ROUTE assignment &middot; {assignment.routeStopCount || group.assignments.length} stops</span>
                    <h3>{assignment.routeName || "Property route"}</h3>
                    <p>{assignmentDateRangeLabel(assignment)}</p>
                  </div>
                  <span className={`beta-assignment-deadline is-${urgency}`}>{assignmentTimingLabel(assignment)}</span>
                </div>
                {assignment.oneTimeCheckRequest && (
                  <div className="beta-assignment-note">
                    <strong>Route instructions</strong>
                    <p>{assignment.oneTimeCheckRequest}</p>
                  </div>
                )}
                <ol className="beta-route-work-stops">
                  {group.assignments.map((stop, index) => {
                    const property = properties.find((item) =>
                      (stop.propertyId && String(item._id) === String(stop.propertyId))
                      || item.name === stop.propertyName
                    );
                    return (
                      <li key={stop._id}>
                        <span>{Number.isInteger(stop.routeStopIndex) ? stop.routeStopIndex + 1 : index + 1}</span>
                        <div><strong>{stop.propertyName}</strong></div>
                        <div className="beta-card-actions">
                          {property && <button className="beta-button compact" onClick={() => onOpenProperty(property, stop)}>Start</button>}
                          {property?.lat && property?.lng && <button className="beta-button secondary compact"
                            onClick={() => onNavigate(property.lat, property.lng)}>Navigate</button>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          }
          const property = properties.find(
            (item) => (assignment.propertyId && String(item._id) === String(assignment.propertyId))
              || item.name === assignment.propertyName
          );
          return (
            <article className={`beta-assignment-card is-${urgency}`} key={assignment._id}>
              <div className="beta-card-header">
                <div>
                  <h3>{assignment.propertyName}</h3>
                  <p>{assignmentDateRangeLabel(assignment)}</p>
                </div>
                <span className={`beta-assignment-deadline is-${urgency}`}>{assignmentTimingLabel(assignment)}</span>
              </div>
              {assignment.oneTimeCheckRequest && (
                <div className="beta-assignment-note">
                  <strong>Special instructions</strong>
                  <p>{assignment.oneTimeCheckRequest}</p>
                </div>
              )}
              <div className="beta-card-actions">
                {property && (
                  <button className="beta-button" onClick={() => onOpenProperty(property, assignment)}>
                    Start Inspection
                  </button>
                )}
                {property?.lat && property?.lng && (
                  <button
                    className="beta-button secondary"
                    onClick={() => onNavigate(property.lat, property.lng)}
                  >
                    Navigate
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div> : <div className="beta-empty-state beta-assignment-empty" role="tabpanel">
        {assignmentEmptyMessage(activeView)}
      </div>}
    </section>
  );
}

export default AssignmentSection;
