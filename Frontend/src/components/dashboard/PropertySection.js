import React from "react";
import PropertyCard from "./PropertyCard";

function PropertySection({
  properties,
  completedProperties,
  isManagement,
  canStartInspection = true,
  role,
  orgName,
  orgType,
  notificationBadges,
  profitStatuses,
  monthlyAssignmentStatuses = {},
  monthlyAssignmentMonth,
  onOpenProperty,
  onManageEmails,
  onManageDetails,
  onAccessInfo,
  onRemove,
  onNavigate,
}) {
  const activityRoutes = notificationBadges.propertyActivityRoutes || [];

  return (
    <section className="beta-section">
      <div className="beta-section-heading">
        <div>
          <h2>{isManagement ? "All Managed Properties" : "All Properties"}</h2>
          <p>
            {isManagement
              ? "Review inspections and property activity."
              : canStartInspection
                ? "Select a property to begin an inspection."
                : "Afterlight resources complete inspections for this service plan."}
          </p>
        </div>
      </div>
      <div className="property-cards">
        {properties.map((property) => {
          const activityRoute = `/admin/submissions/${encodeURIComponent(property.name)}`;
          return (
            <PropertyCard
              key={property._id || property.name}
              property={property}
              isManagement={isManagement}
              canStartInspection={canStartInspection}
              isCompleted={completedProperties.includes(property.name)}
              hasNewActivity={isManagement && activityRoutes.includes(activityRoute)}
              role={role}
              orgName={orgName}
              orgType={orgType}
              profitStatus={profitStatuses[property._id]}
              monthlyAssignmentStatus={monthlyAssignmentStatuses[property.name]}
              monthlyAssignmentMonth={monthlyAssignmentMonth}
              onOpen={onOpenProperty}
              onManageEmails={onManageEmails}
              onManageDetails={onManageDetails}
              onAccessInfo={onAccessInfo}
              onRemove={onRemove}
              onNavigate={onNavigate}
            />
          );
        })}
      </div>
    </section>
  );
}

export default PropertySection;
