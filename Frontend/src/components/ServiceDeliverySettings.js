import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import PageHeader from "./ui/PageHeader";
import AdminVerificationDialog from "./dashboard/dialogs/AdminVerificationDialog";
import ContextualHelpLink from "./help/ContextualHelpLink";

const SERVICE_MODEL_LABELS = {
  platform: "Full-stack SaaS",
  managed: "Managed service",
  hybrid: "Hybrid",
};

const SOURCE_LABELS = {
  customer_employee: "Customer employee",
  customer_contractor: "Customer contractor",
  afterlight_staff: "Afterlight staff",
  afterlight_contractor: "Afterlight contractor",
};

const ROUTING_LABELS = {
  none: "No invoice created",
  customer_accounts_payable: "Customer accounts payable",
  afterlight_service_billing: "Afterlight service billing",
};

const REQUEST_STATUS_LABELS = {
  pending_review: "Pending platform review",
  information_requested: "More information requested",
  approved: "Approved",
  denied: "Denied",
  canceled: "Canceled",
};

const EMPTY_REQUEST = { requestedServiceModel: "", reason: "", proposedEffectiveDate: "" };

export default function ServiceDeliverySettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [audit, setAudit] = useState([]);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [policySavePromptVisible, setPolicySavePromptVisible] = useState(false);
  const [requests, setRequests] = useState([]);
  const [requestDraft, setRequestDraft] = useState(EMPTY_REQUEST);
  const [informationResponse, setInformationResponse] = useState("");

  const load = async () => {
    const [nextSettings, nextAudit, nextRequests] = await Promise.all([
      api.get("/api/fulfillment"),
      api.get("/api/fulfillment/audit"),
      api.get("/api/service-model-changes"),
    ]);
    setSettings(nextSettings);
    setDraft({
      defaultSource: nextSettings.organization.defaultSource,
    });
    setAudit(nextAudit);
    setRequests(nextRequests);
    setRequestDraft((current) => ({
      ...current,
      requestedServiceModel: current.requestedServiceModel
        || nextSettings.options.serviceModels.find((model) => model !== nextSettings.organization.serviceModel)
        || "",
    }));
  };

  useEffect(() => {
    load().catch((loadError) => setError(loadError.message));
  }, []);

  const selectedPolicy = useMemo(() => {
    if (!settings || !draft) return null;
    return settings.options.sourcePolicies[draft.defaultSource];
  }, [settings, draft]);

  const requestOrganizationSave = (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const changed = draft.defaultSource !== settings.organization.defaultSource;
    if (!changed) {
      setMessage("No organization policy changes to save.");
      return;
    }
    setPolicySavePromptVisible(true);
  };

  const saveOrganization = async (passkey) => {
    setSaving("organization");
    setMessage("");
    setError("");
    try {
      const verification = await api.post("/api/organization-security/grants", {
        purpose: "update_fulfillment_policy",
        passkey,
      });
      const updated = await api.put("/api/fulfillment/organization", {
        defaultSource: draft.defaultSource,
        adminActionGrant: verification.grant,
      });
      setSettings(updated);
      setDraft({
        defaultSource: updated.organization.defaultSource,
      });
      setAudit(await api.get("/api/fulfillment/audit"));
      setMessage("Organization defaults updated. Existing assignments were not changed.");
      setPolicySavePromptVisible(false);
      return true;
    } catch (saveError) {
      throw saveError;
    } finally {
      setSaving("");
    }
  };

  const submitServiceModelRequest = async (event) => {
    event.preventDefault();
    setSaving("service-model-request");
    setMessage("");
    setError("");
    try {
      const created = await api.post("/api/service-model-changes", requestDraft);
      setRequests((current) => [created, ...current]);
      setRequestDraft((current) => ({ ...EMPTY_REQUEST, requestedServiceModel: current.requestedServiceModel }));
      setMessage(created.emailDelivered
        ? "Service model change requested. Afterlight platform administration was notified."
        : "Service model change requested. It is visible to platform administration, but the notification email could not be delivered.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving("");
    }
  };

  const submitAdditionalInformation = async (requestId) => {
    setSaving(`respond-${requestId}`);
    setMessage("");
    setError("");
    try {
      const updated = await api.post(`/api/service-model-changes/${requestId}/respond`, {
        message: informationResponse,
      });
      setRequests((current) => current.map((request) => request._id === requestId ? updated : request));
      setInformationResponse("");
      setMessage(updated.emailDelivered
        ? "Additional information sent to Afterlight platform administration."
        : "Additional information saved for platform review, but the notification email could not be delivered.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving("");
    }
  };

  const activeRequest = requests.find((request) => ["pending_review", "information_requested"].includes(request.status));

  const saveProperty = async (propertyId, defaultSource) => {
    setSaving(propertyId);
    setMessage("");
    setError("");
    try {
      const updated = await api.put(`/api/fulfillment/properties/${propertyId}`, {
        defaultSource: defaultSource || null,
      });
      setSettings(updated);
      setAudit(await api.get("/api/fulfillment/audit"));
      setMessage("Property default updated for future assignments.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="beta-page">
      <main className="beta-page-shell beta-fulfillment-page">
        <PageHeader
          onBack={() => navigate("/dashboard")}
          backLabel="Dashboard"
          eyebrow="Organization settings"
          title="Service Delivery"
          subtitle="Choose who fulfills work and let Afterlight route each new assignment to the right operational and billing flow."
          actions={<ContextualHelpLink slug="request-a-service-model-change" />}
        />
        {error && <p className="beta-alert error" role="alert">{error}</p>}
        {message && <p className="beta-alert success" role="status">{message}</p>}
        {!settings || !draft ? (
          !error && <div className="beta-empty-state">Loading service delivery settings...</div>
        ) : (
          <>
            <p className="beta-policy-notice">
              Policy changes apply only to assignments created afterward. Existing assignments keep their saved fulfillment and invoice routing.
            </p>
            <section className="beta-panel beta-fulfillment-settings-card">
              <div className="beta-section-heading">
                <div>
                  <p className="beta-eyebrow">Contract-controlled setting</p>
                  <h2>Service model</h2>
                  <p>Afterlight reviews and applies changes that affect contracted service delivery.</p>
                </div>
                <span className="beta-status success">{SERVICE_MODEL_LABELS[settings.organization.serviceModel]}</span>
              </div>
              {activeRequest ? (
                <div className="beta-service-model-request-summary">
                  <div className="beta-card-header">
                    <div>
                      <strong>{SERVICE_MODEL_LABELS[activeRequest.currentServiceModel]} → {SERVICE_MODEL_LABELS[activeRequest.requestedServiceModel]}</strong>
                      <p>Requested {new Date(activeRequest.createdAt).toLocaleString()}</p>
                    </div>
                    <span className={`beta-status ${activeRequest.status}`}>{REQUEST_STATUS_LABELS[activeRequest.status]}</span>
                  </div>
                  <p><strong>Business reason:</strong> {activeRequest.reason}</p>
                  {activeRequest.platformResponse && <p className="beta-alert warning"><strong>Afterlight response:</strong> {activeRequest.platformResponse}</p>}
                  {activeRequest.status === "information_requested" && (
                    <label className="beta-form-field">Additional information
                      <textarea value={informationResponse} maxLength="2000" onChange={(event) => setInformationResponse(event.target.value)} required />
                      <button type="button" className="beta-button compact" disabled={!informationResponse.trim() || saving === `respond-${activeRequest._id}`}
                        onClick={() => submitAdditionalInformation(activeRequest._id)}>
                        {saving === `respond-${activeRequest._id}` ? "Sending..." : "Send information"}
                      </button>
                    </label>
                  )}
                </div>
              ) : (
                <form className="beta-form-grid" onSubmit={submitServiceModelRequest}>
                  <label className="beta-form-field">Requested service model
                    <select required value={requestDraft.requestedServiceModel}
                      onChange={(event) => setRequestDraft((current) => ({ ...current, requestedServiceModel: event.target.value }))}>
                      {settings.options.serviceModels.filter((model) => model !== settings.organization.serviceModel)
                        .map((model) => <option key={model} value={model}>{SERVICE_MODEL_LABELS[model]}</option>)}
                    </select>
                  </label>
                  <label className="beta-form-field">Proposed effective date (optional)
                    <input type="date" value={requestDraft.proposedEffectiveDate}
                      onChange={(event) => setRequestDraft((current) => ({ ...current, proposedEffectiveDate: event.target.value }))} />
                  </label>
                  <label className="beta-form-field full">Business reason and operational context
                    <textarea required maxLength="2000" value={requestDraft.reason}
                      placeholder="Describe why the organization is requesting this change and any timing considerations."
                      onChange={(event) => setRequestDraft((current) => ({ ...current, reason: event.target.value }))} />
                  </label>
                  <div className="beta-card-actions full">
                    <button className="beta-button" type="submit" disabled={saving === "service-model-request"}>
                      {saving === "service-model-request" ? "Submitting..." : "Request service model change"}
                    </button>
                  </div>
                </form>
              )}
              {requests.filter((request) => !["pending_review", "information_requested"].includes(request.status)).length > 0 && (
                <details className="beta-service-model-history">
                  <summary>Previous service model requests</summary>
                  {requests.filter((request) => !["pending_review", "information_requested"].includes(request.status)).map((request) => (
                    <div key={request._id}>
                      <span>{SERVICE_MODEL_LABELS[request.currentServiceModel]} → {SERVICE_MODEL_LABELS[request.requestedServiceModel]}</span>
                      <span className={`beta-status ${request.status}`}>{REQUEST_STATUS_LABELS[request.status]}</span>
                    </div>
                  ))}
                </details>
              )}
            </section>
            <section className="beta-panel beta-fulfillment-settings-card">
              <div className="beta-section-heading">
                <div>
                  <p className="beta-eyebrow">Organization default</p>
                  <h2>Fulfillment policy</h2>
                  <p>This is the starting point for every property unless a property has its own default.</p>
                </div>
                <span className="beta-status success">Policy v{settings.organization.policyVersion}</span>
              </div>
              <form className="beta-form-grid" onSubmit={requestOrganizationSave}>
                <label className="beta-form-field">Default fulfillment
                  <select value={draft.defaultSource} onChange={(event) => setDraft((current) => ({ ...current, defaultSource: event.target.value }))}>
                    {settings.options.fulfillmentSources.map((value) => <option key={value} value={value}>{SOURCE_LABELS[value]}</option>)}
                  </select>
                </label>
                <div className="beta-fulfillment-preview full">
                  <span>Operational queue: <strong>{selectedPolicy?.queue === "afterlight_coverage" ? "Afterlight Coverage" : "Customer Assigned"}</strong></span>
                  <span>Invoice routing: <strong>{ROUTING_LABELS[selectedPolicy?.invoiceRouting]}</strong></span>
                </div>
                <div className="beta-card-actions full">
                  <button className="beta-button" type="submit" disabled={saving === "organization"}>
                    {saving === "organization" ? "Saving..." : "Save organization policy"}
                  </button>
                </div>
              </form>
            </section>

            <section className="beta-panel beta-fulfillment-settings-card">
              <div className="beta-section-heading">
                <div>
                  <p className="beta-eyebrow">Property overrides</p>
                  <h2>Property defaults</h2>
                  <p>Leave a property on the organization default or give it a different source for future assignments.</p>
                </div>
              </div>
              <div className="beta-fulfillment-property-list">
                {settings.properties.map((property) => (
                  <div className="beta-fulfillment-property-row" key={property.id}>
                    <div><strong>{property.name}</strong><small>Currently: {SOURCE_LABELS[property.resolvedSource]}</small></div>
                    <select
                      aria-label={`Default fulfillment for ${property.name}`}
                      value={property.defaultSource || ""}
                      disabled={saving === property.id}
                      onChange={(event) => saveProperty(property.id, event.target.value)}
                    >
                      <option value="">Use organization default</option>
                      {settings.options.fulfillmentSources.map((value) => <option key={value} value={value}>{SOURCE_LABELS[value]}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </section>

            <section className="beta-panel beta-fulfillment-settings-card">
              <div className="beta-section-heading"><div><p className="beta-eyebrow">Audit history</p><h2>Recent changes and overrides</h2></div></div>
              {audit.length ? (
                <div className="beta-fulfillment-audit-list">
                  {audit.map((entry) => (
                    <div key={entry._id}>
                      <strong>{entry.action.replaceAll("_", " ")}</strong>
                      <span>{entry.metadata?.propertyName || entry.entityType} · {new Date(entry.createdAt).toLocaleString()}</span>
                      <small>By {entry.actorUserId?.email || "organization administrator"}</small>
                    </div>
                  ))}
                </div>
              ) : <div className="beta-empty-state">No fulfillment policy changes have been recorded yet.</div>}
            </section>
          </>
        )}
      </main>
      {policySavePromptVisible && (
        <AdminVerificationDialog
          title="Save organization policy"
          description="Enter your organization passkey to apply this service delivery policy to future assignments."
          continueLabel="Save policy"
          onVerify={saveOrganization}
          onClose={() => setPolicySavePromptVisible(false)}
        />
      )}
    </div>
  );
}
