import React from "react";
import { ASSIGNMENT_VIEWS } from "../../services/assignmentUrgency";

const VIEW_OPTIONS = [
  { value: ASSIGNMENT_VIEWS.ATTENTION, label: "Needs attention" },
  { value: ASSIGNMENT_VIEWS.UPCOMING, label: "Upcoming" },
  { value: ASSIGNMENT_VIEWS.ALL, label: "All assignments" },
];

const VIEW_SUMMARIES = {
  [ASSIGNMENT_VIEWS.ATTENTION]: "Overdue work appears first, followed by assignments due today.",
  [ASSIGNMENT_VIEWS.UPCOMING]: "Future assignments are ordered by their due date.",
  [ASSIGNMENT_VIEWS.ALL]: "All active assignments are ordered by their due date.",
};

export function assignmentEmptyMessage(view) {
  if (view === ASSIGNMENT_VIEWS.ATTENTION) return "Nothing is overdue or due today.";
  if (view === ASSIGNMENT_VIEWS.UPCOMING) return "No upcoming assignments.";
  return "No scheduled assignments.";
}

export default function AssignmentQueueControls({ activeView, counts, onChange }) {
  return (
    <div className="beta-assignment-queue-controls">
      <div className="beta-assignment-tabs" role="tablist" aria-label="Filter assignments by due date">
        {VIEW_OPTIONS.map((option) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeView === option.value}
            className={activeView === option.value ? "active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            <strong>{counts[option.value] || 0}</strong>
          </button>
        ))}
      </div>
      <p className="beta-assignment-view-summary">{VIEW_SUMMARIES[activeView]}</p>
    </div>
  );
}
