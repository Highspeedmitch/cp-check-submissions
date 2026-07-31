import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { storeAuthentication, logoutSession } from "../services/session";
import PageHeader from "./ui/PageHeader";
import ProspectAssessments from "./ProspectAssessments";

const EMPTY_ORGANIZATION = {
  name: "",
  orgType: "COM",
  reportingTimezone: "America/Phoenix",
  initialAdminEmail: "",
};

const ORGANIZATION_TYPES = {
  COM: "Commercial",
  RES: "Residential",
  LTR: "Long-term rental",
  STR: "Short-term rental",
};

const TIMEZONES = [
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
];

function PlatformNavigation({ open, activeView, onClose, onView, onNewOrganization, onLogout }) {
  const go = (view) => {
    onView(view);
    onClose();
  };
  return (
    <>
      <button
        type="button"
        className={`beta-drawer-scrim${open ? " open" : ""}`}
        onClick={onClose}
        aria-label="Close platform navigation"
      />
      <aside className={`beta-sidebar platform-sidebar${open ? " open" : ""}`} aria-label="Platform navigation">
        <div className="platform-sidebar-brand">
          <img src="/apple-touch-icon.png" alt="" />
          <div><strong>Afterlight</strong><small>Platform administration</small></div>
          <button type="button" className="beta-drawer-close" onClick={onClose} aria-label="Close menu">×</button>
        </div>
        <nav>
          <p className="beta-nav-label">Platform</p>
          <button type="button" className={`beta-nav-item${activeView === "overview" ? " active" : ""}`} onClick={() => go("overview")}>Overview</button>
          <button type="button" className="beta-nav-item platform-new-org-button" onClick={() => { onNewOrganization(); onClose(); }}>
            <span>New Organization</span><span aria-hidden="true">+</span>
          </button>
          <p className="beta-nav-label">Marketing tools</p>
          <button type="button" className={`beta-nav-item${activeView === "prospects" ? " active" : ""}`} onClick={() => go("prospects")}>Complimentary Reports</button>
        </nav>
        <div className="platform-sidebar-footer">
          <p>Organization access is temporary, reason-gated, and audited.</p>
          <button type="button" className="beta-text-button beta-logout-link" onClick={onLogout}>Log out</button>
        </div>
      </aside>
    </>
  );
}

function NewOrganizationDialog({ open, busy, error, onClose, onCreate }) {
  const [draft, setDraft] = useState(EMPTY_ORGANIZATION);

  useEffect(() => {
    if (open) setDraft(EMPTY_ORGANIZATION);
  }, [open]);
  if (!open) return null;

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="beta-dialog platform-new-org-dialog" role="dialog" aria-modal="true" aria-labelledby="new-org-title"
        onSubmit={(event) => { event.preventDefault(); onCreate(draft); }}>
        <div className="beta-dialog-header">
          <div><span className="beta-eyebrow">Platform setup</span><h2 id="new-org-title">New Organization</h2></div>
          <button type="button" className="beta-dialog-close" onClick={onClose} disabled={busy} aria-label="Close dialog">×</button>
        </div>
        <p className="beta-dialog-copy">Create the workspace and send its first organization administrator a secure invitation.</p>
        <div className="beta-form-grid">
          <label className="beta-form-field full">Organization name
            <input value={draft.name} maxLength="120" autoComplete="organization" onChange={(event) => update("name", event.target.value)} required autoFocus />
          </label>
          <label className="beta-form-field full">Initial administrator email
            <input type="email" value={draft.initialAdminEmail} autoComplete="email" onChange={(event) => update("initialAdminEmail", event.target.value)} required />
          </label>
          <label className="beta-form-field">Organization type
            <select value={draft.orgType} onChange={(event) => update("orgType", event.target.value)}>
              {Object.entries(ORGANIZATION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="beta-form-field">Reporting timezone
            <select value={draft.reportingTimezone} onChange={(event) => update("reportingTimezone", event.target.value)}>
              {TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone.replace("_", " ")}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="beta-dialog-error" role="alert">{error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="beta-button" disabled={busy}>{busy ? "Creating..." : "Create Organization"}</button>
        </div>
      </form>
    </div>
  );
}

function OrganizationCard({ organization, busy, onEnter, onResendAdminInvite }) {
  const attentionCount = organization.pendingBidCount + organization.pendingInvoiceCount;
  return (
    <article className="platform-organization-card">
      <div className="platform-organization-card-header">
        <span className="platform-organization-avatar" aria-hidden="true">{organization.name.slice(0, 2).toUpperCase()}</span>
        <div><h3>{organization.name}</h3><span className="platform-org-type">{ORGANIZATION_TYPES[organization.orgType] || organization.orgType}</span></div>
      </div>
      <div className="platform-org-stats">
        <div><strong>{organization.propertyCount.toLocaleString()}</strong><span>Properties</span></div>
        <div><strong>{organization.activeUserCount.toLocaleString()}</strong><span>Active users</span></div>
        <div><strong>{organization.recentSubmissionCount.toLocaleString()}</strong><span>30-day reports</span></div>
      </div>
      <div className={`platform-org-attention${attentionCount ? " needs-attention" : ""}`}>
        <span>{attentionCount ? `${attentionCount} workflow item${attentionCount === 1 ? "" : "s"} need attention` : "No pending workflow items"}</span>
        {attentionCount > 0 && <small>{organization.pendingBidCount} bids · {organization.pendingInvoiceCount} invoices</small>}
      </div>
      {organization.pendingAdminInvitation && (
        <div className="platform-org-onboarding">
          <span>Administrator invitation {organization.pendingAdminInvitation.status === "expired" ? "expired" : "pending"}</span>
          <small>{organization.pendingAdminInvitation.email}</small>
          <button type="button" className="beta-text-button" disabled={Boolean(busy)} onClick={() => onResendAdminInvite(organization)}>
            {busy === `invite-${organization.organizationId}` ? "Sending..." : "Resend invitation"}
          </button>
        </div>
      )}
      <button className="beta-button secondary" type="button" disabled={Boolean(busy)} onClick={() => onEnter(organization)}>
        {busy === organization.organizationId ? "Entering..." : "Open Admin View"}
      </button>
    </article>
  );
}

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeView, setActiveView] = useState("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [newOrganizationOpen, setNewOrganizationOpen] = useState(false);
  const [organizationError, setOrganizationError] = useState("");

  const loadReport = useCallback(async () => {
    try {
      setReport(await api.get("/api/platform/organizations"));
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);
  useEffect(() => { loadReport(); }, [loadReport]);

  const organizations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.organizations || []).filter((organization) =>
      !query || `${organization.name} ${organization.orgType}`.toLowerCase().includes(query)
    );
  }, [report, search]);

  async function createOrganization(draft) {
    if (busy) return;
    setBusy("create-organization");
    setOrganizationError("");
    try {
      const created = await api.post("/api/platform/organizations", draft);
      await loadReport();
      setNewOrganizationOpen(false);
      setMessage(created.invitationDelivered
        ? `${created.name} was created and its administrator invitation was sent to ${created.initialAdminEmail}.`
        : `${created.name} was created, but its administrator invitation could not be delivered. Support can resend the pending invitation.`);
      setActiveView("overview");
    } catch (requestError) {
      setOrganizationError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function enterOrganization(organization) {
    const reason = window.prompt(`Why are you entering ${organization.name}?`, "Development and support");
    if (!reason?.trim() || busy) return;
    setBusy(organization.organizationId);
    setError("");
    try {
      const authentication = await api.post(`/api/platform/organizations/${organization.organizationId}/assume`, { reason: reason.trim() });
      storeAuthentication(authentication);
      window.location.assign("/dashboard");
    } catch (requestError) {
      setError(requestError.message);
      setBusy("");
    }
  }

  async function resendAdminInvitation(organization) {
    const invitation = organization.pendingAdminInvitation;
    if (!invitation || busy) return;
    setBusy(`invite-${organization.organizationId}`);
    setError("");
    setMessage("");
    try {
      const result = await api.post(`/api/platform/organizations/${organization.organizationId}/admin-invitations/${invitation.invitationId}/resend`);
      setMessage(result.message);
      await loadReport();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    await logoutSession();
    navigate("/");
  }

  const summaryMetrics = report ? [
    ["Organizations", report.summary.organizationCount],
    ["Active users", report.summary.activeUserCount],
    ["Properties", report.summary.propertyCount],
    ["30-day reports", report.summary.recentSubmissionCount],
    ["Pending bids", report.summary.pendingBidCount],
    ["Invoice attention", report.summary.pendingInvoiceCount],
  ] : [];

  return (
    <div className="beta-dashboard platform-dashboard">
      <PlatformNavigation open={navOpen} activeView={activeView} onClose={() => setNavOpen(false)} onView={setActiveView}
        onNewOrganization={() => { setOrganizationError(""); setNewOrganizationOpen(true); }} onLogout={logout} />
      <div className="beta-dashboard-main platform-dashboard-main">
        <div className="beta-mobile-topbar">
          <button type="button" className="beta-menu-button" onClick={() => setNavOpen(true)} aria-label="Open menu">☰</button>
          <strong>Platform</strong><span className="beta-avatar" aria-hidden="true">A</span>
        </div>
        <PageHeader eyebrow="Platform administration"
          title={activeView === "overview" ? "Organization Overview" : "Complimentary Reports"}
          subtitle={activeView === "overview" ? "Portfolio health, tenant activity, and audited support access." : "Create and manage standalone property opportunity reports."} />
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}

        {activeView === "prospects" ? <ProspectAssessments /> : !report ? (
          <div className="beta-empty-state">Loading platform metrics...</div>
        ) : (
          <>
            <section className="platform-metric-board" aria-label="Platform summary">
              {summaryMetrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}
            </section>
            <section className="platform-organizations-section">
              <div className="beta-section-heading platform-organizations-heading">
                <div><h2>Organizations</h2><p>Open an organization to begin a temporary audited administrator session.</p></div>
                <label className="platform-search"><span className="sr-only">Search organizations</span>
                  <input type="search" placeholder="Search organizations" value={search} onChange={(event) => setSearch(event.target.value)} />
                </label>
              </div>
              {organizations.length ? (
                <div className="platform-organization-grid">
                  {organizations.map((organization) => <OrganizationCard key={organization.organizationId} organization={organization} busy={busy} onEnter={enterOrganization} onResendAdminInvite={resendAdminInvitation} />)}
                </div>
              ) : <div className="beta-empty-state">No organizations match that search.</div>}
            </section>
          </>
        )}
      </div>
      <NewOrganizationDialog open={newOrganizationOpen} busy={busy === "create-organization"} error={organizationError}
        onClose={() => !busy && setNewOrganizationOpen(false)} onCreate={createOrganization} />
    </div>
  );
}
