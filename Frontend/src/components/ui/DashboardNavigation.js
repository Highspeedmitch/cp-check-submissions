import React from "react";
import { MILEAGE_TRACKING_ENABLED } from "../../featureFlags";

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
  darkMode,
  setDarkMode,
  mileageTracking,
  mileageCount,
  onMileageToggle,
  onLogout,
  notificationBadges = {},
}) {
  const isAdmin = role === "admin";
  const isManager = role === "property_manager";
  const isManagement = isAdmin || isManager;
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

        <nav>
          <p className="beta-nav-label">Workspace</p>
          <NavButton active badge={notificationBadges.dashboard} onClick={() => go("/dashboard")}>Dashboard</NavButton>
          {isManagement && (
            <NavButton onClick={() => go("/reporting")}>Reporting</NavButton>
          )}
          {orgType === "COM" && role !== "client" && (
            <NavButton badge={notificationBadges.billing} onClick={() => go("/billing")}>Billing</NavButton>
          )}
          {(isManager || (isAdmin && orgType === "COM")) && (
            <NavButton badge={notificationBadges.bids} onClick={() => go("/bid-requests")}>
              {isManager ? "Bid Requests" : "Bid Management"}
            </NavButton>
          )}

          {isAdmin && (
            <>
              <p className="beta-nav-label">Admin tools</p>
              <NavButton onClick={() => go("/scheduler")}>Scheduler</NavButton>
              <NavButton onClick={onAddProperty}>Add Property</NavButton>
              {orgType === "COM" && <NavButton onClick={() => go("/admin/users")}>Users</NavButton>}
              {orgType === "COM" && <NavButton onClick={() => go("/organization-form-settings")}>Form Template</NavButton>}
              {orgType !== "COM" && <NavButton onClick={() => go("/payments")}>Payments</NavButton>}
              <button type="button" className="beta-nav-danger" onClick={onRemoveProperty}>
                Remove Property
              </button>
            </>
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

        <div className="beta-sidebar-footer">
          {MILEAGE_TRACKING_ENABLED && role !== "admin" && (
            <label className="beta-setting-row">
              <span>Mileage tracking</span>
              <input type="checkbox" checked={mileageTracking} onChange={onMileageToggle} />
              {mileageTracking && <small>{mileageCount ? mileageCount.toFixed(1) : "0"} mi</small>}
            </label>
          )}
          <label className="beta-setting-row">
            <span>Dark mode</span>
            <input type="checkbox" checked={darkMode} onChange={() => setDarkMode(!darkMode)} />
          </label>
          <button type="button" className="beta-text-button beta-logout-link" onClick={onLogout}>Log out</button>
        </div>
      </aside>
    </>
  );
}
