import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { storeAuthentication, logoutSession } from "../services/session";
import { beginOktaLogin, oktaConfigured } from "../services/okta";
import PageHeader from "./ui/PageHeader";
import ContextualHelpLink from "./help/ContextualHelpLink";
import ProspectAssessments from "./ProspectAssessments";
import PricingEstimator from "./PricingEstimator";
import ThemeToggle from "./ui/ThemeToggle";
import PlatformResources from "./PlatformResources";
import PlatformServiceBilling from "./PlatformServiceBilling";
import PlatformServiceModelChanges from "./PlatformServiceModelChanges";
import OrganizationOnboardingWizard, {
  ORGANIZATION_TYPES,
} from "./platform/OrganizationOnboardingWizard";
import {
  NOTIFICATION_SECTIONS,
  useMarkNotificationsRead,
  useNotificationBadges,
} from "../services/notificationCenter";

const PENDING_ADMIN_VIEW_STEP_UP = "afterlightPendingAdminViewStepUp";
const PENDING_CAPABILITY_STEP_UP = "afterlightPendingCapabilityStepUp";
const PENDING_ADMIN_VIEW_LIFETIME_MS = 10 * 60 * 1000;

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
          <button type="button" className={`beta-nav-item${activeView === "overview" ? " active" : ""}`} onClick={() => go("overview")}><span>Overview</span>{notificationBadges.platformOrganizations > 0 && <span className="beta-nav-badge">{notificationBadges.platformOrganizations > 9 ? "9+" : notificationBadges.platformOrganizations}</span>}</button>
          <button type="button" className={`beta-nav-item${activeView === "billing" ? " active" : ""}`} onClick={() => go("billing")}><span>Service Billing</span>{notificationBadges.platformBilling > 0 && <span className="beta-nav-badge">{notificationBadges.platformBilling > 9 ? "9+" : notificationBadges.platformBilling}</span>}</button>
          <button type="button" className={`beta-nav-item${activeView === "resources" ? " active" : ""}`} onClick={() => go("resources")}><span>Resources &amp; Payables</span>{notificationBadges.resources > 0 && <span className="beta-nav-badge">{notificationBadges.resources > 9 ? "9+" : notificationBadges.resources}</span>}</button>
          <button type="button" className={`beta-nav-item${activeView === "service-models" ? " active" : ""}`} onClick={() => go("service-models")}><span>Service Plan Requests</span>{notificationBadges.serviceModels > 0 && <span className="beta-nav-badge">{notificationBadges.serviceModels > 9 ? "9+" : notificationBadges.serviceModels}</span>}</button>
          <button type="button" className="beta-nav-item" onClick={() => { onHelp(); onClose(); }}>Help Center</button>
          <button type="button" className="beta-nav-item platform-new-org-button" onClick={() => { onNewOrganization(); onClose(); }}>
            <span>New Organization</span><span aria-hidden="true">+</span>
          </button>
          <p className="beta-nav-label">Marketing tools</p>
          <button type="button" className={`beta-nav-item${activeView === "prospects" ? " active" : ""}`} onClick={() => go("prospects")}>Complimentary Reports</button>
          <button type="button" className={`beta-nav-item${activeView === "pricing" ? " active" : ""}`} onClick={() => go("pricing")}>Pricing Estimator</button>
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
          Enter a new six-digit code from your authenticator app to {request.kind === "capability"
            ? `change billing capabilities for ${request.organization.name}`
            : `open the Admin View for ${request.organization.name}`}.
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

function OrganizationCapabilitiesDialog({ organization, busy, error, onClose, onSave }) {
  const [experience, setExperience] = useState("authenticated_portal");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setExperience(organization?.invoiceApprovalExperience || "authenticated_portal");
    setReason("");
  }, [organization]);
  if (!organization) return null;

  const supported = ["managed", "hybrid"].includes(organization.serviceModel);
  const incompleteApSetup = organization.emailApPropertyCount < organization.propertyCount;
  return (
    <div className="beta-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="beta-dialog" role="dialog" aria-modal="true" aria-labelledby="organization-capabilities-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ invoiceApprovalExperience: experience, reason: reason.trim() });
        }}>
        <div className="beta-dialog-header">
          <div>
            <span className="beta-eyebrow">Platform-controlled capability</span>
            <h2 id="organization-capabilities-title">Invoice approval for {organization.name}</h2>
          </div>
          <button type="button" className="beta-dialog-close" disabled={busy} onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        <p className="beta-dialog-copy">Choose how property managers approve managed-service invoices. Organization administrators cannot change this setting.</p>
        <label className="beta-form-field">Approval experience
          <select value={experience} onChange={(event) => setExperience(event.target.value)}>
            <option value="authenticated_portal">Standard Afterlight review</option>
            <option value="secure_email_link" disabled={!supported}>Secure email approval</option>
          </select>
        </label>
        {!supported && <p className="beta-alert notice">Secure email approval is currently limited to Managed service and Hybrid organizations.</p>}
        {experience === "secure_email_link" && incompleteApSetup && (
          <p className="beta-alert notice">
            {organization.emailApPropertyCount} of {organization.propertyCount} properties currently have AP email delivery configured. Ineligible invoices will continue using standard Afterlight review.
          </p>
        )}
        <label className="beta-form-field">Reason for change
          <textarea required maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)}
            placeholder="Record the customer request or operational reason." />
        </label>
        {error && <p className="beta-dialog-error" role="alert">{error}</p>}
        <div className="beta-dialog-actions">
          <button type="button" className="beta-button secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="beta-button" disabled={busy || !reason.trim()}>
            {busy ? "Saving..." : "Save capability"}
          </button>
        </div>
      </form>
    </div>
  );
}

function OrganizationCard({ organization, busy, onEnter, onManageCapabilities, onResendAdminInvite }) {
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
      {organization.onboarding && !organization.pendingAdminInvitation && (
        <div className={`platform-org-onboarding${organization.onboarding.status === "completed" ? " complete" : ""}`}>
          <span>{organization.onboarding.status === "completed" ? "Onboarding completed" : "Administrator onboarding in progress"}</span>
          <small>{organization.onboarding.requiredComplete} of {organization.onboarding.requiredTotal} required setup items complete</small>
        </div>
      )}
      <div className="platform-organization-actions">
        <button className="beta-button secondary" type="button" disabled={Boolean(busy)} onClick={() => onManageCapabilities(organization)}>
          Manage capabilities
        </button>
        <button className="beta-button secondary" type="button" disabled={Boolean(busy)} onClick={() => onEnter(organization)}>
          {busy === organization.organizationId ? "Entering..." : "Open Admin View"}
        </button>
      </div>
      <small className="platform-capability-summary">Invoice approval: {organization.invoiceApprovalExperience === "secure_email_link" ? "Secure email" : "Standard Afterlight review"}</small>
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
    return ["overview", "billing", "resources", "service-models", "prospects", "pricing"].includes(requestedView)
      ? requestedView
      : "overview";
  });
  const [navOpen, setNavOpen] = useState(false);
  const [newOrganizationOpen, setNewOrganizationOpen] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [capabilityOrganization, setCapabilityOrganization] = useState(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [stepUpRequest, setStepUpRequest] = useState(null);
  const notificationBadges = useNotificationBadges(true);
  const helpSlug = activeView === "billing"
    ? "process-afterlight-service-invoices"
    : activeView === "resources"
      ? "manage-resources-and-payables"
      : activeView === "service-models"
        ? "review-service-model-change-requests"
        : activeView === "pricing"
          ? "calculate-preliminary-service-pricing"
          : activeView === "overview"
            ? "create-and-access-an-organization"
            : "";
  const activeNotificationTypes = activeView === "billing"
    ? NOTIFICATION_SECTIONS.platformBilling
    : activeView === "resources"
      ? NOTIFICATION_SECTIONS.resources
      : activeView === "service-models"
        ? NOTIFICATION_SECTIONS.serviceModels
        : activeView === "overview"
          ? NOTIFICATION_SECTIONS.platformOrganizations
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

  const beginIdentityConfirmation = useCallback(async (organization, reason, pending = { kind: "assume" }) => {
    const challenge = await api.post("/api/auth/mfa/step-up/challenge", {});
    if (challenge.provider === "totp" && challenge.challengeToken) {
      setStepUpRequest({
        organization,
        reason,
        ...pending,
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
      const storageKey = pending.kind === "capability"
        ? PENDING_CAPABILITY_STEP_UP
        : PENDING_ADMIN_VIEW_STEP_UP;
      sessionStorage.setItem(storageKey, JSON.stringify({
        organizationId: organization.organizationId,
        reason,
        ...pending,
        createdAt: Date.now(),
      }));
      try {
        await beginOktaLogin({
          returnTo: pending.kind === "capability"
            ? "/platform?resumeCapability=1"
            : "/platform?resumeAdminView=1",
          stepUp: true,
        });
      } catch (requestError) {
        sessionStorage.removeItem(storageKey);
        throw requestError;
      }
      return;
    }
    throw new Error(challenge.message || "Identity confirmation is unavailable.");
  }, []);

  const attemptCapabilityUpdate = useCallback(async (
    organization,
    capability,
    allowStepUp = true
  ) => {
    setBusy(`capability-${organization.organizationId}`);
    setCapabilityError("");
    try {
      const result = await api.put(
        `/api/platform/organizations/${organization.organizationId}/billing-capabilities`,
        capability
      );
      await loadReport();
      setCapabilityOrganization(null);
      setMessage(result.invoiceApprovalExperience === "secure_email_link"
        ? `Secure email invoice approval enabled for ${organization.name}.`
        : `Standard Afterlight invoice review restored for ${organization.name}.`);
    } catch (requestError) {
      const stepUpRequired = ["STEP_UP_REQUIRED", "OKTA_REAUTH_REQUIRED"]
        .includes(requestError.data?.code);
      if (allowStepUp && stepUpRequired) {
        try {
          await beginIdentityConfirmation(organization, capability.reason, {
            kind: "capability",
            invoiceApprovalExperience: capability.invoiceApprovalExperience,
          });
        } catch (confirmationError) {
          setCapabilityError(confirmationError.message);
        }
        return;
      }
      setCapabilityError(requestError.message);
    } finally {
      setBusy("");
    }
  }, [beginIdentityConfirmation, loadReport]);

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

  useEffect(() => {
    if (!report || searchParams.get("resumeCapability") !== "1") return;
    const pendingValue = sessionStorage.getItem(PENDING_CAPABILITY_STEP_UP);
    sessionStorage.removeItem(PENDING_CAPABILITY_STEP_UP);
    setSearchParams({});
    if (!pendingValue) {
      setError("The pending capability change could not be restored. Please try again.");
      return;
    }
    try {
      const pending = JSON.parse(pendingValue);
      const organization = report.organizations.find(
        (candidate) => candidate.organizationId === pending.organizationId
      );
      if (!organization || !pending.reason || !pending.invoiceApprovalExperience
        || !pending.createdAt || Date.now() - pending.createdAt > PENDING_ADMIN_VIEW_LIFETIME_MS) {
        setError("The pending capability change expired or could not be restored. Please try again.");
        return;
      }
      setCapabilityOrganization(organization);
      attemptCapabilityUpdate(organization, {
        invoiceApprovalExperience: pending.invoiceApprovalExperience,
        reason: pending.reason,
      }, false);
    } catch (_parseError) {
      setError("The pending capability change could not be restored. Please try again.");
    }
  }, [attemptCapabilityUpdate, report, searchParams, setSearchParams]);

  async function createOrganization(draft) {
    if (busy) return false;
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
      return true;
    } catch (requestError) {
      setOrganizationError(requestError.message);
      return false;
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
      if (pendingRequest.kind === "capability") {
        await attemptCapabilityUpdate(pendingRequest.organization, {
          invoiceApprovalExperience: pendingRequest.invoiceApprovalExperience,
          reason: pendingRequest.reason,
        }, false);
      } else {
        await attemptOrganizationAccess(
          pendingRequest.organization,
          pendingRequest.reason,
          false
        );
      }
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
          title={activeView === "overview" ? "Organization Overview" : activeView === "billing" ? "Service Billing" : activeView === "resources" ? "Resources & Payables" : activeView === "service-models" ? "Service Plan Requests" : activeView === "pricing" ? "Pricing Estimator" : "Complimentary Reports"}
          subtitle={activeView === "overview" ? "Portfolio health, tenant activity, and audited support access." : activeView === "billing" ? "Prepare and reconcile invoices for Afterlight-delivered work." : activeView === "resources" ? "Deploy Afterlight resources and reconcile contractor payments through Gusto." : activeView === "service-models" ? "Review and apply organization service-model and license-tier requests." : activeView === "pricing" ? "Calculate preliminary service pricing for prospective customer conversations." : "Create and manage standalone property opportunity reports."}
          actions={<ContextualHelpLink slug={helpSlug} />} />
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}

        {activeView === "prospects" ? <ProspectAssessments /> : activeView === "pricing" ? <PricingEstimator /> : activeView === "billing" ? <PlatformServiceBilling /> : activeView === "resources" ? <PlatformResources /> : activeView === "service-models" ? <PlatformServiceModelChanges /> : !report ? (
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
                  {organizations.map((organization) => <OrganizationCard key={organization.organizationId} organization={organization} busy={busy} onEnter={enterOrganization}
                    onManageCapabilities={(selected) => { setCapabilityError(""); setCapabilityOrganization(selected); }} onResendAdminInvite={resendAdminInvitation} />)}
                </div>
              ) : <div className="beta-empty-state">No organizations match that search.</div>}
            </section>
          </>
        )}
      </div>
      <OrganizationOnboardingWizard open={newOrganizationOpen} busy={busy === "create-organization"} error={organizationError}
        onClose={() => !busy && setNewOrganizationOpen(false)} onCreate={createOrganization} />
      <OrganizationCapabilitiesDialog organization={capabilityOrganization}
        busy={busy === `capability-${capabilityOrganization?.organizationId}`}
        error={capabilityError}
        onClose={() => { if (!busy) setCapabilityOrganization(null); }}
        onSave={(capability) => attemptCapabilityUpdate(capabilityOrganization, capability)} />
      <StepUpAuthenticationDialog
        request={stepUpRequest}
        onClose={() => !stepUpRequest?.working && setStepUpRequest(null)}
        onVerify={verifyStepUp}
      />
    </div>
  );
}
