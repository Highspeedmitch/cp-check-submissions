import React from "react";

function AssignmentSection({ assignments, properties, onOpenProperty, onNavigate }) {
  if (assignments.length === 0) return null;

  return (
    <section className="beta-section">
      <div className="beta-section-heading">
        <div>
          <h2>My Assignments</h2>
          <p>Your scheduled property work.</p>
        </div>
      </div>
      <div className="beta-assignment-grid">
        {assignments.slice(0, 4).map((assignment) => {
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
                  <button className="beta-button" onClick={() => onOpenProperty(property)}>
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
