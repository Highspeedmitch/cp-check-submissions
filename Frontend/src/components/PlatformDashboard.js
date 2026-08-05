import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { storeAuthentication, logoutSession } from "../services/session";
import { beginOktaLogin, oktaConfigured } from "../services/okta";
import PageHeader from "./ui/PageHeader";
import ProspectAssessments from "./ProspectAssessments";
import ThemeToggle from "./ui/ThemeToggle";
import PlatformResources from "./PlatformResources";
import PlatformServiceBilling from "./PlatformServiceBilling";
import PlatformServiceModelChanges from "./PlatformServiceModelChanges";
import {
  NOTIFICATION_SECTIONS,
  useMarkNotificationsRead,
  useNotificationBadges,
} from "../services/notificationCenter";

const PENDING_ADMIN_VIEW_STEP_UP = "afterlightPendingAdminViewStepUp";
const PENDING_ADMIN_VIEW_LIFETIME_MS = 10 * 60 * 1000;

const EMPTY_ORGANIZATION = {
  name: "",
  orgType: "COM",
  serviceModel: "managed",
  defaultFulfillmentSource: "afterlight_staff",
  reportingTimezone: "America/Phoenix",
  initialAdminEmail: "",
};

const ORGANIZATION_TYPES = {
  COM: "Commercial",
  RES: "Residential",
  LTR: "Long-term rental",
  STR: "Short-term rental",
};

const SERVICE_MODELS = {
  platform: "Full-stack SaaS",
  managed: "Managed service",
  hybrid: "Hybrid",
};

const SERVICE_MODEL_DEFAULTS = {
  platform: "customer_employee",
  managed: "afterlight_staff",
  hybrid: "customer_employee",
};

const FULFILLMENT_SOURCES = {
  customer_employee: "Customer employee",
  customer_contractor: "Customer contractor",
  afterlight_staff: "Afterlight staff",
  afterlight_contractor: "Afterlight contractor",
};

const TIMEZONES = [
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
];

function PlatformNavigation({ open, activeView, notificationBadges, onClose, onView, onNewOrganization, onHelp, onLogout }) {
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
          <button type="button" className={`beta-nav-item${activeView === "billing" ? " active" : ""}`} onClick={() => go("billing")}><span>Service Billing</span>{notificationBadges.platformBilling > 0 && <span className="beta-nav-badge">{notificationBadges.platformBilling > 9 ? "9+" : notificationBadges.platformBilling}</span>}</button>
          <button type="button" className={`beta-nav-item${activeView === "resources" ? " active" : ""}`} onClick={() => go("resources")}><span>Resources &amp; Payables</span>{notificationBadges.resources > 0 && <span className="beta-nav-badge">{notificationBadges.resources > 9 ? "9+" : notificationBadges.resources}</span>}</button>
          <button type="button" className={`beta-nav-item${activeView === "service-models" ? " active" : ""}`} onClick={() => go("service-models")}><span>Service Model Requests</span>{notificationBadges.serviceModels > 0 && <span className="beta-nav-badge">{notificationBadges.serviceModels > 9 ? "9+" : notificationBadges.serviceModels}</span>}</button>
          <button type="button" className="beta-nav-item" onClick={() => { onHelp(); onClose(); }}>Help Center</button>
          <button type="button" className="beta-nav-item platform-new-org-button" onClick={() => { onNewOrganization(); onClose(); }}>
            <span>New Organization</span><span aria-hidden="true">+</span>
          </button>
          <p className="beta-nav-label">Marketing tools</p>
          <button type="button" className={`beta-nav-item${activeView === "prospects" ? " active" : ""}`} onClick={() => go("prospects")}>Complimentary Reports</button>
        </nav>
        <div className="platform-sidebar-footer">
          <p>Organization access is temporary, reason-gated, and audited.</p>
          <ThemeToggle />
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
          <label className="beta-form-field">Service model
            <select value={draft.serviceModel} onChange={(event) => {
              const serviceModel = event.target.value;
              setDraft((current) => ({
                ...current,
                serviceModel,
                defaultFulfillmentSource: SERVICE_MODEL_DEFAULTS[serviceModel],
              }));
            }}>
              {Object.entries(SERVICE_MODELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="beta-form-field">Default fulfillment
            <select value={draft.defaultFulfillmentSource} onChange={(event) => update("defaultFulfillmentSource", event.target.value)}>
              {Object.entries(FULFILLMENT_SOURCES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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

function StepUpAuthenticationDialog({ request, onClose, onVerify }) {
  const [code, setCode] = useState("");

  useEffect(() => { setCode(""); }, [request?.challengeToken]);
  if (!request) return null;

  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && !request.working && onClose()}>
      <form
        className="beta-dialog platform-step-up-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-step-up-title"
        onSubmit={(event) => {
          event.preventDefault();
          onVerify(code);
        }}
      >
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Protected administrator access</span>
            <h2 id="platform-step-up-title">Confirm your identity</h2>
          </div>
          <button type="button" className="beta-dialog-close" onClick={onClose} disabled={request.working} aria-label="Close dialog">×</button>
        </div>
        <p className="beta-dialog-copy" id="platform-step-up-description">
          Enter a new six-digit code from your authenticator app to open the Admin View for {request.organization.name}.
        </p>
        <label className="beta-field">
          Authentication code
          <input
            className="platform-step-up-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength="6"
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-describedby="platform-step-up-description"
            required
            autoFocus
          />
        </label>
        {request.error && <p className="beta-dialog-error" role="alert">{request.error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" onClick={onClose} disabled={request.working}>Cancel</button>
          <button type="submit" className="beta-button" disabled={request.working || code.length !== 6}>
            {request.working ? "Verifying..." : "Verify and continue"}
          </button>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeView, setActiveView] = useState(() => {
    const requestedView = searchParams.get("view");
    return ["overview", "billing", "resources", "service-models", "prospects"].includes(requestedView)
      ? requestedView
      : "overview";
  });
  const [navOpen, setNavOpen] = useState(false);
  const [newOrganizationOpen, setNewOrganizationOpen] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [stepUpRequest, setStepUpRequest] = useState(null);
  const notificationBadges = useNotificationBadges(true);
  const activeNotificationTypes = activeView === "billing"
    ? NOTIFICATION_SECTIONS.platformBilling
    : activeView === "resources"
      ? NOTIFICATION_SECTIONS.resources
      : activeView === "service-models"
        ? NOTIFICATION_SECTIONS.serviceModels
        : [];
  useMarkNotificationsRead(activeNotificationTypes);

  const selectView = useCallback((view) => {
    setError("");
    setActiveView(view);
    if (view === "overview") setSearchParams({});
    else setSearchParams({ view });
  }, [setSearchParams]);

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

  const beginIdentityConfirmation = useCallback(async (organization, reason) => {
    const challenge = await api.post("/api/auth/mfa/step-up/challenge", {});
    if (challenge.provider === "totp" && challenge.challengeToken) {
      setStepUpRequest({
        organization,
        reason,
        challengeToken: challenge.challengeToken,
        working: false,
        error: "",
      });
      return;
    }
    if (challenge.provider === "okta") {
      if (!oktaConfigured) {
        throw new Error("Okta identity confirmation is not available in this application build.");
      }
      sessionStorage.setItem(PENDING_ADMIN_VIEW_STEP_UP, JSON.stringify({
        organizationId: organization.organizationId,
        reason,
        createdAt: Date.now(),
      }));
      try {
        await beginOktaLogin({
          returnTo: "/platform?resumeAdminView=1",
          stepUp: true,
        });
      } catch (requestError) {
        sessionStorage.removeItem(PENDING_ADMIN_VIEW_STEP_UP);
        throw requestError;
      }
      return;
    }
    throw new Error(challenge.message || "Identity confirmation is unavailable.");
  }, []);

  const attemptOrganizationAccess = useCallback(async (organization, reason, allowStepUp = true) => {
    setBusy(organization.organizationId);
    setError("");
    try {
      const authentication = await api.post(
        `/api/platform/organizations/${organization.organizationId}/assume`,
        { reason }
      );
      storeAuthentication(authentication);
      window.location.assign("/dashboard");
    } catch (requestError) {
      setBusy("");
      const stepUpRequired = ["STEP_UP_REQUIRED", "OKTA_REAUTH_REQUIRED"]
        .includes(requestError.data?.code);
      if (allowStepUp && stepUpRequired) {
        try {
          await beginIdentityConfirmation(organization, reason);
        } catch (confirmationError) {
          setError(confirmationError.message);
        }
        return;
      }
      setError(requestError.message);
    }
  }, [beginIdentityConfirmation]);

  useEffect(() => {
    if (!report || searchParams.get("resumeAdminView") !== "1") return;
    const pendingValue = sessionStorage.getItem(PENDING_ADMIN_VIEW_STEP_UP);
    sessionStorage.removeItem(PENDING_ADMIN_VIEW_STEP_UP);
    setSearchParams({});
    if (!pendingValue) {
      setError("The pending Admin View request could not be restored. Please try again.");
      return;
    }
    try {
      const pending = JSON.parse(pendingValue);
      if (
        !pending.createdAt
        || Date.now() - pending.createdAt > PENDING_ADMIN_VIEW_LIFETIME_MS
      ) {
        setError("The pending Admin View request expired. Please try again.");
        return;
      }
      const organization = report.organizations.find(
        (candidate) => candidate.organizationId === pending.organizationId
      );
      if (!organization || !pending.reason) {
        setError("The pending Admin View request could not be restored. Please try again.");
        return;
      }
      attemptOrganizationAccess(organization, pending.reason, false);
    } catch (_parseError) {
      setError("The pending Admin View request could not be restored. Please try again.");
    }
  }, [attemptOrganizationAccess, report, searchParams, setSearchParams]);

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
      selectView("overview");
    } catch (requestError) {
      setOrganizationError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function enterOrganization(organization) {
    const reason = window.prompt(`Why are you entering ${organization.name}?`, "Development and support");
    if (!reason?.trim() || busy) return;
    await attemptOrganizationAccess(organization, reason.trim());
  }

  async function verifyStepUp(code) {
    if (!stepUpRequest || stepUpRequest.working) return;
    const pendingRequest = stepUpRequest;
    setStepUpRequest((current) => ({ ...current, working: true, error: "" }));
    try {
      const authentication = await api.post("/api/auth/mfa/step-up/verify", {
        challengeToken: pendingRequest.challengeToken,
        code,
      });
      storeAuthentication(authentication);
      setStepUpRequest(null);
      await attemptOrganizationAccess(
        pendingRequest.organization,
        pendingRequest.reason,
        false
      );
    } catch (requestError) {
      setStepUpRequest((current) => current && ({
        ...current,
        working: false,
        error: requestError.message,
      }));
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
      <PlatformNavigation open={navOpen} activeView={activeView} notificationBadges={notificationBadges} onClose={() => setNavOpen(false)} onView={selectView}
        onNewOrganization={() => { setOrganizationError(""); setNewOrganizationOpen(true); }} onHelp={() => navigate("/help")} onLogout={logout} />
      <div className="beta-dashboard-main platform-dashboard-main">
        <div className="beta-mobile-topbar">
          <button type="button" className="beta-menu-button" onClick={() => setNavOpen(true)} aria-label="Open menu">☰</button>
          <strong>Platform</strong><span className="beta-avatar" aria-hidden="true">A</span>
        </div>
        <PageHeader eyebrow="Platform administration"
          title={activeView === "overview" ? "Organization Overview" : activeView === "billing" ? "Service Billing" : activeView === "resources" ? "Resources & Payables" : activeView === "service-models" ? "Service Model Requests" : "Complimentary Reports"}
          subtitle={activeView === "overview" ? "Portfolio health, tenant activity, and audited support access." : activeView === "billing" ? "Prepare and reconcile invoices for Afterlight-delivered work." : activeView === "resources" ? "Deploy Afterlight resources and reconcile contractor payments through Gusto." : activeView === "service-models" ? "Review and apply organization contract-change requests." : "Create and manage standalone property opportunity reports."} />
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}

        {activeView === "prospects" ? <ProspectAssessments /> : activeView === "billing" ? <PlatformServiceBilling /> : activeView === "resources" ? <PlatformResources /> : activeView === "service-models" ? <PlatformServiceModelChanges /> : !report ? (
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
      <StepUpAuthenticationDialog
        request={stepUpRequest}
        onClose={() => !stepUpRequest?.working && setStepUpRequest(null)}
        onVerify={verifyStepUp}
      />
    </div>
  );
}
