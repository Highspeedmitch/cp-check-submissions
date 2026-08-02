import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import PageHeader from "./ui/PageHeader";
import AdminVerificationDialog from "./dashboard/dialogs/AdminVerificationDialog";

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

export default function ServiceDeliverySettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [audit, setAudit] = useState([]);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [policySavePromptVisible, setPolicySavePromptVisible] = useState(false);

  const load = async () => {
    const [nextSettings, nextAudit] = await Promise.all([
      api.get("/api/fulfillment"),
      api.get("/api/fulfillment/audit"),
    ]);
    setSettings(nextSettings);
    setDraft({
      serviceModel: nextSettings.organization.serviceModel,
      defaultSource: nextSettings.organization.defaultSource,
    });
    setAudit(nextAudit);
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
    const changed = draft.serviceModel !== settings.organization.serviceModel
      || draft.defaultSource !== settings.organization.defaultSource;
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
        ...draft,
        adminActionGrant: verification.grant,
      });
      setSettings(updated);
      setDraft({
        serviceModel: updated.organization.serviceModel,
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
                  <p className="beta-eyebrow">Organization default</p>
                  <h2>Fulfillment policy</h2>
                  <p>This is the starting point for every property unless a property has its own default.</p>
                </div>
                <span className="beta-status success">Policy v{settings.organization.policyVersion}</span>
              </div>
              <form className="beta-form-grid" onSubmit={requestOrganizationSave}>
                <label className="beta-form-field">Service model
                  <select value={draft.serviceModel} onChange={(event) => setDraft((current) => ({ ...current, serviceModel: event.target.value }))}>
                    {settings.options.serviceModels.map((value) => <option key={value} value={value}>{SERVICE_MODEL_LABELS[value]}</option>)}
                  </select>
                </label>
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
