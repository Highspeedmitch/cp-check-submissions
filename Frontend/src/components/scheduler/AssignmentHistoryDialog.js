import React from "react";

const FULFILLMENT_LABELS = {
  customer_employee: "Customer employee",
  customer_contractor: "Customer contractor",
  afterlight_staff: "Afterlight staff",
  afterlight_contractor: "Afterlight contractor",
  legacy: "Legacy assignment",
};

function date(value, { includeTime = false } = {}) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return includeTime
    ? parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : parsed.toLocaleDateString([], { dateStyle: "medium" });
}

export default function AssignmentHistoryDialog({ assignments, loading, error, onClose }) {
  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className="beta-dialog beta-assignment-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-history-title"
      >
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Read-only audit trail</span>
            <h2 id="assignment-history-title">Assignment history</h2>
          </div>
          <button type="button" className="beta-dialog-close" aria-label="Close assignment history" onClick={onClose}>{"\u00d7"}</button>
        </div>
        <p className="beta-dialog-copy">
          Completed and canceled assignments remain available here for operational review.
        </p>
        {loading ? <div className="beta-empty-state">Loading assignment history...</div> : error ? (
          <p className="beta-alert error" role="alert">{error}</p>
        ) : assignments.length === 0 ? (
          <div className="beta-empty-state">No completed or canceled assignments yet.</div>
        ) : (
          <div className="beta-table-wrap">
            <table className="beta-data-table beta-assignment-history-table">
              <thead><tr><th>Property</th><th>Fulfillment</th><th>Assigned to</th><th>Date assigned</th><th>Assigned by</th><th>Completed / canceled</th><th>Status</th></tr></thead>
              <tbody>{assignments.map((assignment) => (
                <tr key={assignment._id}>
                  <td><strong>{assignment.propertyName}</strong>{assignment.eventType && <small>{assignment.eventType}</small>}</td>
                  <td>{FULFILLMENT_LABELS[assignment.fulfillmentType] || assignment.fulfillmentType}</td>
                  <td>{assignment.assignedTo?.name || "Unknown user"}</td>
                  <td>{date(assignment.scheduledAt)}</td>
                  <td>{assignment.assignedBy?.name || "Not recorded"}<small>{date(assignment.assignedAt, { includeTime: true })}</small></td>
                  <td>{date(assignment.completedAt || assignment.canceledAt, { includeTime: true })}</td>
                  <td><span className={`beta-status ${assignment.status === "completed" ? "success" : "declined"}`}>{assignment.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
