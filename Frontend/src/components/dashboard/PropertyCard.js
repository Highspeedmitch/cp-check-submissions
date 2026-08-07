import React from "react";
import { format } from "date-fns";

function PropertyCard({
  property,
  isManagement,
  isCompleted,
  hasNewActivity,
  role,
  orgName,
  orgType,
  profitStatus,
  onOpen,
  onManageEmails,
  onManageDetails,
  onAccessInfo,
  onRemove,
  onNavigate,
}) {
  const isUnassigned =
    role === "admin" && (property.propertyManagers || []).length === 0;
  return (
    <div className="beta-property-card">
      <div className="beta-card-header">
        <div>
          <h3>{property.name}</h3>
          <p>
            {isManagement
              ? "Inspection history and property activity"
              : "Property inspection checklist"}
          </p>
        </div>
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
                : "Ready"}
        </span>
      </div>
      <div className="beta-card-actions beta-property-actions">
        <button className="beta-button" onClick={() => onOpen(property)}>
          {isManagement ? "View Submissions" : "Start Inspection"}
        </button>
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

      {role !== "admin" && property.lat && property.lng && (
        <button
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
  );
}

export default PropertyCard;
