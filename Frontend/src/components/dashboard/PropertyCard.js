import React from "react";
import { format } from "date-fns";

const MONTHLY_ASSIGNMENT_LABELS = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  completed: "Completed",
  missed: "Missed",
};

function PropertyCard({
  property,
  isManagement,
  canStartInspection = true,
  isCompleted,
  hasNewActivity,
  role,
  orgName,
  orgType,
  profitStatus,
  monthlyAssignmentStatus,
  monthlyAssignmentMonth,
  onOpen,
  onManageEmails,
  onManageDetails,
  onAccessInfo,
  onRemove,
  onNavigate,
}) {
  const isUnassigned =
    role === "admin" && (property.propertyManagers || []).length === 0;
  const monthlyStatus = MONTHLY_ASSIGNMENT_LABELS[monthlyAssignmentStatus?.status]
    ? monthlyAssignmentStatus.status
    : "";
  return (
    <div className="beta-property-card">
      <div className="beta-card-header">
        <div>
          <h3>{property.name}</h3>
          <p>
            {isManagement
              ? "Inspection history and property activity"
              : canStartInspection
                ? "Property inspection checklist"
                : "Afterlight-managed property"}
          </p>
        </div>
        <div className="beta-property-status-stack">
          <span className={`beta-status ${
            hasNewActivity || isCompleted ? "completed" : isUnassigned ? "declined" : ""
          }`}>
            {hasNewActivity
              ? "New!"
              : isCompleted
                ? "Completed"
                : isUnassigned
                  ? "Unassigned"
                : isManagement
                  ? "Managed"
                  : canStartInspection ? "Ready" : "Afterlight"}
          </span>
          {isManagement && monthlyStatus && (
            <span className={`beta-status beta-monthly-assignment-status is-${monthlyStatus}`}
              aria-label={`${monthlyAssignmentMonth || "Current month"} schedule: ${MONTHLY_ASSIGNMENT_LABELS[monthlyStatus]}`}>
              {MONTHLY_ASSIGNMENT_LABELS[monthlyStatus]}
            </span>
          )}
        </div>
      </div>
      <div className="beta-card-actions beta-property-actions">
        {(isManagement || canStartInspection) && (
          <button className="beta-button" onClick={() => onOpen(property)}>
            {isManagement ? "View Submissions" : "Start Inspection"}
          </button>
        )}
        {role === "admin" && (
          <button
            type="button"
            className="beta-button secondary"
            onClick={() => onManageEmails(property)}
          >
            Manage Emails
          </button>
        )}
        {isManagement && orgType === "COM" && (
          <button
            type="button"
            className="beta-button secondary"
            onClick={() => onManageDetails(property)}
          >
            Manage Details
          </button>
        )}
        {role !== "admin" && property.lat && property.lng && (
          <button
            type="button"
            className="beta-button secondary"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate(property.lat, property.lng);
            }}
          >
            Navigate
          </button>
        )}
      </div>

      {role === "admin" && orgName === "AzRoots" && (
        <p>
          Profit Statement for {format(new Date(), "MMM")}: {profitStatus || "❌"}
        </p>
      )}

      {role === "admin" && orgType === "STR" && (
        <button
          className="beta-button secondary"
          onClick={(event) => {
            event.stopPropagation();
            onAccessInfo(property);
          }}
        >
          Access / Info
        </button>
      )}

      {role === "admin" && orgType !== "STR" && (
        <button
          className="remove-button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(property);
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}

export default PropertyCard;
