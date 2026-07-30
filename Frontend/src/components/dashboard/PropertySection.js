import React from "react";
import PropertyCard from "./PropertyCard";

function PropertySection({
  properties,
  completedProperties,
  isManagement,
  role,
  orgName,
  orgType,
  notificationBadges,
  profitStatuses,
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
              : "Select a property to begin an inspection."}
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
              isCompleted={completedProperties.includes(property.name)}
              hasNewActivity={isManagement && activityRoutes.includes(activityRoute)}
              role={role}
              orgName={orgName}
              orgType={orgType}
              profitStatus={profitStatuses[property._id]}
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
