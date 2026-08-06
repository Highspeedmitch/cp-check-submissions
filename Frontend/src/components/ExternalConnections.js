import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logoutSession } from "../services/session";
import CalendarFeedCard from "./CalendarFeedCard";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import DashboardNavigation from "./ui/DashboardNavigation";
import PageHeader from "./ui/PageHeader";

export default function ExternalConnections({ setUser }) {
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const accountScope = localStorage.getItem("accountScope") || "organization";
  const resourceWorkspace = accountScope === "afterlight_resource";
  const role = localStorage.getItem("role") || "user";
  const navigationRole = resourceWorkspace ? "resource" : role;
  const orgName = resourceWorkspace
    ? "Afterlight Resource Network"
    : localStorage.getItem("orgName") || "Your Organization";
  const orgType = localStorage.getItem("orgType") || "COM";

  async function logout() {
    await logoutSession();
    setUser?.(false);
    navigate("/login");
  }

  return (
    <div className="beta-dashboard">
      <DashboardNavigation
        open={navOpen}
        onClose={() => setNavOpen(false)}
        role={navigationRole}
        orgName={orgName}
        orgType={orgType}
        accountScope={accountScope}
        activeRoute="external-connections"
        navigate={navigate}
        onLogout={logout}
      />
      <main className="beta-dashboard-main">
        <div className="beta-mobile-topbar">
          <button type="button" className="beta-menu-button" onClick={() => setNavOpen(true)} aria-label="Open menu">☰</button>
          <strong>External Connections</strong>
          <span className="beta-avatar" aria-hidden="true">{orgName.slice(0, 1)}</span>
        </div>
        <PageHeader
          eyebrow={resourceWorkspace ? "Afterlight Resource Network" : `Working on behalf of ${orgName}`}
          title="External Connections"
          subtitle="Manage services connected to your Afterlight account."
          actions={<WorkspaceSwitcher />}
        />
        <CalendarFeedCard />
      </main>
    </div>
  );
}
