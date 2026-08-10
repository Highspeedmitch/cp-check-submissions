import React from "react";

function AssignmentSection({ assignments, properties, onOpenProperty, onNavigate }) {
  if (assignments.length === 0) return null;
  const groupedAssignments = [];
  const routeGroups = new Map();
  assignments.forEach((assignment) => {
    if (!assignment.routeRunId) {
      groupedAssignments.push({ type: "property", assignments: [assignment] });
      return;
    }
    const routeRunId = String(assignment.routeRunId);
    if (!routeGroups.has(routeRunId)) {
      const group = { type: "route", routeRunId, assignments: [] };
      routeGroups.set(routeRunId, group);
      groupedAssignments.push(group);
    }
    routeGroups.get(routeRunId).assignments.push(assignment);
  });
  routeGroups.forEach((group) => group.assignments.sort(
    (first, second) => (first.routeStopIndex || 0) - (second.routeStopIndex || 0)
  ));

  return (
    <section className="beta-section">
      <div className="beta-section-heading">
        <div>
          <h2>My Assignments</h2>
          <p>Your scheduled property work.</p>
        </div>
      </div>
      <div className="beta-assignment-grid">
        {groupedAssignments.slice(0, 4).map((group) => {
          const assignment = group.assignments[0];
          if (group.type === "route") {
            return (
              <article className="beta-assignment-card beta-route-work-card" key={group.routeRunId}>
                <div className="beta-card-header">
                  <div>
                    <span className="beta-eyebrow">ROUTE assignment · {assignment.routeStopCount || group.assignments.length} stops</span>
                    <h3>{assignment.routeName || "Property route"}</h3>
                    <p>{new Date(assignment.startDate).toLocaleDateString()}</p>
                  </div>
                  <span className="beta-status warning">Scheduled</span>
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
                      String(item._id) === String(stop.propertyId)
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
            (item) => item.name === assignment.propertyName
          );
          return (
            <article className="beta-assignment-card" key={assignment._id}>
              <div className="beta-card-header">
                <div>
                  <h3>{assignment.propertyName}</h3>
                  <p>{new Date(assignment.startDate).toLocaleDateString()}</p>
                </div>
                <span className="beta-status warning">Scheduled</span>
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
      </div>
    </section>
  );
}

export default AssignmentSection;
