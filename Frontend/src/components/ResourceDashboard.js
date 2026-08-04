import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { logoutSession } from "../services/session";
import PageHeader from "./ui/PageHeader";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import DashboardNavigation from "./ui/DashboardNavigation";
import {
  NOTIFICATION_SECTIONS,
  useMarkNotificationsRead,
  useNotificationBadges,
} from "../services/notificationCenter";

const STATUS_LABELS = {
  pending_approval: "Pending approval",
  approved: "Approved",
  payout_pending: "Queued for Gusto",
  paid: "Paid",
  void: "Void",
};

function money(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);
}

function inspectionRoute(assignment) {
  const routes = {
    COM: "/form",
    RES: "/residential-form",
    LTR: "/long-term-rental-form",
    STR: "/short-term-rental-form",
  };
  const base = routes[assignment.orgType] || "/form";
  return `${base}/${encodeURIComponent(assignment.propertyName)}?assignmentId=${encodeURIComponent(assignment._id)}`;
}

export default function ResourceDashboard({ setUser }) {
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const notificationBadges = useNotificationBadges(true);
  useMarkNotificationsRead([
    ...NOTIFICATION_SECTIONS.dashboard,
    ...NOTIFICATION_SECTIONS.resources,
  ]);

  useEffect(() => {
    api.get("/api/resource-workspace/dashboard")
      .then((dashboard) => {
        localStorage.setItem("resourceType", dashboard?.profile?.resourceType || "contractor");
        setData(dashboard);
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  const scheduled = useMemo(() => (data?.assignments || []).filter(
    (assignment) => assignment.status === "scheduled"
  ), [data]);
  const earningsTotal = useMemo(() => (data?.earnings || [])
    .filter((earning) => earning.status !== "void")
    .reduce((sum, earning) => sum + earning.grossAmountCents + (earning.reimbursementCents || 0), 0), [data]);
  const isContractor = data?.profile?.resourceType === "contractor";

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
        role="resource"
        orgName="Afterlight Resource Network"
        orgType={localStorage.getItem("orgType") || "COM"}
        accountScope="afterlight_resource"
        navigate={navigate}
        onLogout={logout}
        showMileageTracking={false}
        notificationBadges={{
          ...notificationBadges,
          dashboard: notificationBadges.dashboard + notificationBadges.resources,
        }}
      />
      <main className="beta-dashboard-main beta-resource-workspace">
        <div className="beta-mobile-topbar">
          <button type="button" className="beta-menu-button" onClick={() => setNavOpen(true)} aria-label="Open menu">☰</button>
          <strong>My Work</strong>
          <span className="beta-avatar" aria-hidden="true">{(data?.profile?.displayName || "R").slice(0, 1)}</span>
        </div>
        <PageHeader
          eyebrow="Afterlight Resource Network"
          title={data?.profile?.displayName || "My Work"}
          subtitle={isContractor
            ? "Review assigned work and track contractor earnings separately from customer billing."
            : "Review Afterlight-assigned work across your active customer deployments."}
          actions={<WorkspaceSwitcher />}
        />
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {!data && !error ? <div className="beta-empty-state">Loading your assigned work...</div> : data && (
          <>
            {data.profile.status !== "active" && (
              <p className="beta-policy-notice">
                Your resource profile is {data.profile.status}. New assignments remain unavailable until Afterlight completes activation.
              </p>
            )}
            <section className="platform-metric-board" aria-label="Resource summary">
              <div><span>Scheduled work</span><strong>{scheduled.length}</strong></div>
              {isContractor
                ? <div><span>Recorded earnings</span><strong>{money(earningsTotal)}</strong></div>
                : <div><span>Relationship</span><strong>{data.profile.resourceType}</strong></div>}
              <div><span>Availability</span><strong>{data.profile.availabilityStatus}</strong></div>
            </section>

            <section className="beta-section">
              <div className="beta-section-heading"><div><h2>My Assignments</h2><p>Only work explicitly deployed and assigned to you appears here.</p></div></div>
              {scheduled.length ? <div className="beta-assignment-grid">
                {scheduled.map((assignment) => (
                  <article className="beta-assignment-card" key={assignment._id}>
                    <div className="beta-card-header">
                      <div><h3>{assignment.propertyName}</h3><p>{assignment.organizationName}</p></div>
                      <span className="beta-status warning">Scheduled</span>
                    </div>
                    <p>{new Date(assignment.startDate).toLocaleDateString()} to {new Date(assignment.endDate).toLocaleDateString()}</p>
                    {assignment.oneTimeCheckRequest && <div className="beta-assignment-note"><strong>Special instructions</strong><p>{assignment.oneTimeCheckRequest}</p></div>}
                    {isContractor && <div className="beta-fulfillment-preview">
                      <span>Assignment compensation</span>
                      <strong>{money(assignment.compensationSnapshot?.amountCents, assignment.compensationSnapshot?.currency)}</strong>
                    </div>}
                    <div className="beta-card-actions">
                      <button type="button" className="beta-button" onClick={() => navigate(inspectionRoute(assignment))}>Start Inspection</button>
                      {assignment.property?.lat && assignment.property?.lng && (
                        <button type="button" className="beta-button secondary" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${assignment.property.lat},${assignment.property.lng}`, "_blank")}>Navigate</button>
                      )}
                    </div>
                  </article>
                ))}
              </div> : <div className="beta-empty-state">No scheduled assignments.</div>}
            </section>

            {isContractor && <section className="beta-panel">
              <div className="beta-section-heading"><div><h2>Earnings</h2><p>These records are Afterlight payables and are not customer invoices.</p></div></div>
              {data.earnings.length ? <div className="beta-resource-earnings-list">
                {data.earnings.map((earning) => (
                  <div key={earning._id}>
                    <div><strong>{earning.organizationId?.name || "Afterlight assignment"}</strong><small>{new Date(earning.earnedAt).toLocaleDateString()}</small></div>
                    <span className={`beta-status ${earning.status === "paid" ? "success" : "warning"}`}>{STATUS_LABELS[earning.status]}</span>
                    <strong>{money(earning.grossAmountCents + (earning.reimbursementCents || 0), earning.currency)}</strong>
                  </div>
                ))}
              </div> : <div className="beta-empty-state">Completed assignment earnings will appear here.</div>}
            </section>}
          </>
        )}
      </main>
    </div>
  );
}
