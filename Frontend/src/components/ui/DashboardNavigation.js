import React, { useState } from "react";
import { canAccessExternalConnections } from "../../services/externalConnectionsAccess";
import WorkspaceSwitcher from "../WorkspaceSwitcher";
import ThemeToggle from "./ThemeToggle";

const NAVIGATION_SECTION_STORAGE_KEY = "afterlight.dashboard-navigation.sections.v1";

function sectionStorageKey(accountScope) {
  return `${NAVIGATION_SECTION_STORAGE_KEY}.${accountScope}`;
}

function initialSectionState(accountScope, activeRoute) {
  const defaults = {
    workspace: activeRoute !== "onboarding",
    adminTools: activeRoute === "onboarding",
  };

  try {
    const stored = JSON.parse(localStorage.getItem(sectionStorageKey(accountScope)) || "null");
    if (!stored || typeof stored !== "object") return defaults;
    return {
      workspace: typeof stored.workspace === "boolean" ? stored.workspace : defaults.workspace,
      adminTools: typeof stored.adminTools === "boolean" ? stored.adminTools : defaults.adminTools,
    };
  } catch (_error) {
    return defaults;
  }
}

function badgeTotal(...counts) {
  return counts.reduce((total, count) => total + (Number(count) || 0), 0);
}

function NavButton({ active, children, onClick, badge = 0 }) {
  return (
    <button
      type="button"
      className={`beta-nav-item${active ? " active" : ""}`}
      onClick={onClick}
    >
      <span>{children}</span>
      {badge > 0 && <span className="beta-nav-badge" aria-label={`${badge} unread notifications`}>{badge > 9 ? "9+" : badge}</span>}
    </button>
  );
}

function NavigationSection({ id, label, expanded, onToggle, badge = 0, children }) {
  return (
    <section className="beta-nav-section">
      <button
        type="button"
        className="beta-nav-section-toggle"
        aria-expanded={expanded}
        aria-controls={`${id}-content`}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span className="beta-nav-section-meta">
          {!expanded && badge > 0 && (
            <span className="beta-nav-badge" aria-label={`${badge} unread notifications`}>
              {badge > 9 ? "9+" : badge}
            </span>
          )}
          <span className={`beta-nav-section-chevron${expanded ? " expanded" : ""}`} aria-hidden="true" />
        </span>
      </button>
      <div id={`${id}-content`} className="beta-nav-section-content" hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}

export default function DashboardNavigation({
  open,
  onClose,
  role,
  orgName,
  orgType,
  navigate,
  searchQuery,
  setSearchQuery,
  onSearch,
  onClearSearch,
  regions,
  selectedRegion,
  setSelectedRegion,
  onRegionFilter,
  onAddProperty,
  onRemoveProperty,
  onLogout,
  canAccessBilling = false,
  notificationBadges = {},
  accountScope = "organization",
  activeRoute = "dashboard",
}) {
  const isAdmin = role === "admin";
  const isManager = role === "property_manager";
  const isManagement = isAdmin || isManager;
  const externalConnectionsAllowed = canAccessExternalConnections({ role, accountScope });
  const dashboardRoute = accountScope === "afterlight_resource" ? "/resource" : "/dashboard";
  const [sections, setSections] = useState(() => initialSectionState(accountScope, activeRoute));
  const toggleSection = (section) => {
    setSections((current) => {
      const next = { ...current, [section]: !current[section] };
      try {
        localStorage.setItem(sectionStorageKey(accountScope), JSON.stringify(next));
      } catch (_error) {
        // Navigation still works when browser storage is unavailable.
      }
      return next;
    });
  };
  const go = (route) => {
    navigate(route);
    onClose();
  };

  return (
    <>
      <button
        type="button"
        className={`beta-drawer-scrim${open ? " open" : ""}`}
        onClick={onClose}
        aria-label="Close navigation"
      />
      <aside className={`beta-sidebar${open ? " open" : ""}`} aria-label="Primary navigation">
        <div className="beta-sidebar-brand">
          <strong>{orgName}</strong>
          <button type="button" className="beta-drawer-close" onClick={onClose} aria-label="Close menu">×</button>
        </div>

        <div className="beta-sidebar-scroll">
          <nav>
            <NavigationSection
              id="workspace-navigation"
              label="Workspace"
              expanded={sections.workspace}
              onToggle={() => toggleSection("workspace")}
              badge={badgeTotal(notificationBadges.dashboard, notificationBadges.billing, notificationBadges.bids)}
            >
              <NavButton active={activeRoute === "dashboard"} badge={notificationBadges.dashboard} onClick={() => go(dashboardRoute)}>Dashboard</NavButton>
              {open && (
                <div className="beta-mobile-workspace-switcher">
                  <WorkspaceSwitcher className="beta-nav-item" showActionLabel />
                </div>
              )}
              {externalConnectionsAllowed && (
                <NavButton active={activeRoute === "external-connections"} onClick={() => go("/external-connections")}>External Connections</NavButton>
              )}
              {isManagement && (
                <NavButton onClick={() => go("/reporting")}>Reporting</NavButton>
              )}
              {isManagement && (
                <NavButton onClick={() => go("/scheduler")}>Scheduler</NavButton>
              )}
              {orgType === "COM" && canAccessBilling && (
                <NavButton badge={notificationBadges.billing} onClick={() => go("/billing")}>Billing</NavButton>
              )}
              <NavButton onClick={() => go("/help")}>Help Center</NavButton>
              {(isManager || (isAdmin && orgType === "COM")) && (
                <NavButton badge={notificationBadges.bids} onClick={() => go("/bid-requests")}>
                  {isManager ? "Bid Requests" : "Bid Management"}
                </NavButton>
              )}
            </NavigationSection>

            {isAdmin && (
              <NavigationSection
                id="admin-tools-navigation"
                label="Admin tools"
                expanded={sections.adminTools}
                onToggle={() => toggleSection("adminTools")}
                badge={notificationBadges.serviceModels}
              >
                <NavButton active={activeRoute === "onboarding"} onClick={() => go("/onboarding")}>Setup Guide</NavButton>
                <NavButton onClick={onAddProperty}>Add Property</NavButton>
                {orgType === "COM" && <NavButton onClick={() => go("/admin/users")}>Users</NavButton>}
                <NavButton active={activeRoute === "bulk-onboarding"} onClick={() => go("/admin/bulk-onboarding")}>Bulk Onboarding</NavButton>
                {orgType === "COM" && <NavButton onClick={() => go("/organization-form-settings")}>Form Template</NavButton>}
                <NavButton badge={notificationBadges.serviceModels} onClick={() => go("/service-delivery")}>Service Delivery</NavButton>
                <NavButton onClick={() => go("/organization-security")}>Security</NavButton>
                <button type="button" className="beta-nav-danger" onClick={onRemoveProperty}>
                  Remove Property
                </button>
              </NavigationSection>
            )}
          </nav>

          {isManagement && (
            <div className="beta-sidebar-filters">
              <p className="beta-nav-label">Find a property</p>
              <label className="beta-field-label" htmlFor="property-search">Search</label>
              <div className="beta-search-row">
                <input
                  id="property-search"
                  type="search"
                  value={searchQuery}
                  placeholder="Property name"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && onSearch()}
                />
                <button type="button" className="beta-icon-button" onClick={onSearch} aria-label="Search properties">⌕</button>
              </div>
              {searchQuery && (
                <button type="button" className="beta-text-button" onClick={onClearSearch}>Clear search</button>
              )}
              <label className="beta-field-label" htmlFor="property-region">Region</label>
              <select
                id="property-region"
                value={selectedRegion}
                onChange={(event) => setSelectedRegion(event.target.value)}
              >
                <option value="">All regions</option>
                {regions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
              <button type="button" className="beta-button secondary compact" onClick={onRegionFilter}>
                Apply filter
              </button>
            </div>
          )}
        </div>

        <div className="beta-sidebar-footer">
          <ThemeToggle />
          <button type="button" className="beta-text-button beta-logout-link" onClick={onLogout}>Log out</button>
        </div>
      </aside>
    </>
  );
}
