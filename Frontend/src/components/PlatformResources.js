import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const EMPTY_RESOURCE = {
  displayName: "",
  email: "",
  skills: "",
  regions: "",
  defaultRate: "",
};

function money(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);
}

function id(value) {
  return String(value?._id || value || "");
}

export default function PlatformResources() {
  const [data, setData] = useState(null);
  const [resourceDraft, setResourceDraft] = useState(EMPTY_RESOURCE);
  const [resourceEdits, setResourceEdits] = useState({});
  const [deployment, setDeployment] = useState({ resourceId: "", organizationId: "", propertyIds: [], rateOverride: "" });
  const [selectedEarnings, setSelectedEarnings] = useState([]);
  const [checkDate, setCheckDate] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const dashboard = await api.get("/api/platform-resources/dashboard");
      setData(dashboard);
      setResourceEdits(Object.fromEntries(dashboard.resources.map((resource) => [resource._id, {
        displayName: resource.displayName,
        skills: (resource.skills || []).join(", "),
        regions: (resource.regions || []).join(", "),
        defaultRate: ((resource.defaultRateCents || 0) / 100).toFixed(2),
        availabilityStatus: resource.availabilityStatus,
        status: resource.status,
        gustoContractorUuid: resource.gusto?.contractorUuid || "",
        gustoOnboardingStatus: resource.gusto?.onboardingStatus || "not_started",
      }])));
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedOrganization = useMemo(() => data?.organizations.find(
    (organization) => organization._id === deployment.organizationId
  ), [data, deployment.organizationId]);
  const approvedEarnings = useMemo(() => (data?.earnings || []).filter(
    (earning) => earning.status === "approved"
  ), [data]);

  const run = async (key, operation, successMessage) => {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const result = await operation();
      await load();
      setMessage(typeof successMessage === "function" ? successMessage(result) : successMessage);
      return result || true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy("");
    }
  };

  async function inviteResource(event) {
    event.preventDefault();
    const completed = await run("invite", () => api.post("/api/platform-resources/resources", {
      displayName: resourceDraft.displayName,
      email: resourceDraft.email,
      skills: resourceDraft.skills,
      regions: resourceDraft.regions,
      defaultRateCents: Math.round(Number(resourceDraft.defaultRate) * 100),
    }), (result) => result.linkedExistingUser
      ? "Existing Afterlight identity linked. The Resource Portal will appear after the user signs in again."
      : "Afterlight resource invited. Complete Afterlight and Gusto onboarding before activation.");
    if (completed) setResourceDraft(EMPTY_RESOURCE);
  }

  async function saveResource(resourceId) {
    const edit = resourceEdits[resourceId];
    await run(`resource-${resourceId}`, () => api.put(`/api/platform-resources/resources/${resourceId}`, {
      displayName: edit.displayName,
      skills: edit.skills,
      regions: edit.regions,
      defaultRateCents: Math.round(Number(edit.defaultRate) * 100),
      availabilityStatus: edit.availabilityStatus,
      status: edit.status,
      gustoContractorUuid: edit.gustoContractorUuid,
      gustoOnboardingStatus: edit.gustoOnboardingStatus,
    }), "Resource profile updated.");
  }

  async function createDeployment(event) {
    event.preventDefault();
    const completed = await run("deployment", () => api.post(
      `/api/platform-resources/resources/${deployment.resourceId}/deployments`,
      {
        organizationId: deployment.organizationId,
        propertyIds: deployment.propertyIds,
        rateOverrideCents: deployment.rateOverride
          ? Math.round(Number(deployment.rateOverride) * 100)
          : null,
      }
    ), "Resource deployment saved.");
    if (completed) setDeployment({ resourceId: "", organizationId: "", propertyIds: [], rateOverride: "" });
  }

  async function createPayoutBatch(event) {
    event.preventDefault();
    const completed = await run("batch", () => api.post("/api/platform-resources/payout-batches", {
      earningIds: selectedEarnings,
      checkDate,
    }), "Gusto payout batch prepared. Submit it in Gusto, then record the submission reference here.");
    if (completed) {
      setSelectedEarnings([]);
      setCheckDate("");
    }
  }

  if (!data) return error ? <p className="beta-alert error">{error}</p> : <div className="beta-empty-state">Loading resources...</div>;

  return (
    <div className="platform-resources">
      {error && <p className="beta-alert error" role="alert">{error}</p>}
      {message && <p className="beta-alert success" role="status">{message}</p>}

      <section className="beta-panel">
        <div className="beta-section-heading"><div><p className="beta-eyebrow">Afterlight-owned supply</p><h2>Add a Resource</h2><p>An existing submitter keeps the same login and gains a workspace switcher. A new email receives an invitation.</p></div></div>
        <form className="beta-form-grid" onSubmit={inviteResource}>
          <label className="beta-form-field">Name<input required value={resourceDraft.displayName} onChange={(event) => setResourceDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
          <label className="beta-form-field">Email<input required type="email" value={resourceDraft.email} onChange={(event) => setResourceDraft((current) => ({ ...current, email: event.target.value }))} /></label>
          <label className="beta-form-field">Skills<input value={resourceDraft.skills} placeholder="Inspections, lighting" onChange={(event) => setResourceDraft((current) => ({ ...current, skills: event.target.value }))} /></label>
          <label className="beta-form-field">Regions<input value={resourceDraft.regions} placeholder="Phoenix, Tucson" onChange={(event) => setResourceDraft((current) => ({ ...current, regions: event.target.value }))} /></label>
          <label className="beta-form-field">Default per-assignment rate<input required min="0.01" step="0.01" type="number" value={resourceDraft.defaultRate} onChange={(event) => setResourceDraft((current) => ({ ...current, defaultRate: event.target.value }))} /></label>
          <div className="beta-card-actions full"><button className="beta-button" disabled={busy === "invite"}>{busy === "invite" ? "Adding..." : "Add Resource"}</button></div>
        </form>
      </section>

      <section className="beta-section">
        <div className="beta-section-heading"><div><h2>Resource Profiles</h2><p>New identities must accept their Afterlight invitation. Every resource must complete Gusto onboarding before activation.</p></div></div>
        {data.resources.length ? <div className="platform-resource-grid">
          {data.resources.map((resource) => {
            const edit = resourceEdits[resource._id] || {};
            return <article className="beta-panel platform-resource-card" key={resource._id}>
              <div className="beta-card-header"><div><h3>{resource.displayName}</h3><p>{resource.email}</p></div><span className={`beta-status ${resource.status === "active" ? "success" : "warning"}`}>{resource.status}</span></div>
              <div className="beta-form-grid">
                <label className="beta-form-field full">Display name<input value={edit.displayName || ""} onChange={(event) => setResourceEdits((current) => ({ ...current, [resource._id]: { ...edit, displayName: event.target.value } }))} /></label>
                <label className="beta-form-field">Default rate<input min="0" step="0.01" type="number" value={edit.defaultRate || ""} onChange={(event) => setResourceEdits((current) => ({ ...current, [resource._id]: { ...edit, defaultRate: event.target.value } }))} /></label>
                <label className="beta-form-field">Availability<select value={edit.availabilityStatus || "available"} onChange={(event) => setResourceEdits((current) => ({ ...current, [resource._id]: { ...edit, availabilityStatus: event.target.value } }))}><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label>
                <label className="beta-form-field full">Skills<input value={edit.skills || ""} onChange={(event) => setResourceEdits((current) => ({ ...current, [resource._id]: { ...edit, skills: event.target.value } }))} /></label>
                <label className="beta-form-field full">Regions<input value={edit.regions || ""} onChange={(event) => setResourceEdits((current) => ({ ...current, [resource._id]: { ...edit, regions: event.target.value } }))} /></label>
                <label className="beta-form-field full">Gusto contractor UUID (API integrations only)<input value={edit.gustoContractorUuid || ""} placeholder="Leave blank for manual Gusto payments" onChange={(event) => setResourceEdits((current) => ({ ...current, [resource._id]: { ...edit, gustoContractorUuid: event.target.value } }))} /></label>
                <label className="beta-form-field">Gusto onboarding<select value={edit.gustoOnboardingStatus || "not_started"} onChange={(event) => setResourceEdits((current) => ({ ...current, [resource._id]: { ...edit, gustoOnboardingStatus: event.target.value } }))}><option value="not_started">Not started</option><option value="self_onboarding_invited">Invited</option><option value="self_onboarding_started">Started</option><option value="self_onboarding_review">Needs review</option><option value="onboarding_completed">Completed</option></select></label>
                <label className="beta-form-field">Afterlight status<select value={edit.status || "invited"} onChange={(event) => setResourceEdits((current) => ({ ...current, [resource._id]: { ...edit, status: event.target.value } }))}><option value="invited">Invited</option><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
              </div>
              <button type="button" className="beta-button" disabled={busy === `resource-${resource._id}`} onClick={() => saveResource(resource._id)}>Save Resource</button>
            </article>;
          })}
        </div> : <div className="beta-empty-state">No Afterlight resources have been invited.</div>}
      </section>

      <section className="beta-panel">
        <div className="beta-section-heading"><div><p className="beta-eyebrow">Tenant access</p><h2>Deploy a Resource</h2><p>An empty property selection makes the resource eligible across the organization.</p></div></div>
        <form className="beta-form-grid" onSubmit={createDeployment}>
          <label className="beta-form-field">Active resource<select required value={deployment.resourceId} onChange={(event) => setDeployment((current) => ({ ...current, resourceId: event.target.value }))}><option value="">Select resource</option>{data.resources.filter((resource) => resource.status === "active").map((resource) => <option key={resource._id} value={resource._id}>{resource.displayName}</option>)}</select></label>
          <label className="beta-form-field">Managed or hybrid organization<select required value={deployment.organizationId} onChange={(event) => setDeployment((current) => ({ ...current, organizationId: event.target.value, propertyIds: [] }))}><option value="">Select organization</option>{data.organizations.map((organization) => <option key={organization._id} value={organization._id}>{organization.name} ({organization.serviceModel})</option>)}</select></label>
          <label className="beta-form-field">Rate override<input min="0.01" step="0.01" type="number" value={deployment.rateOverride} placeholder="Use resource default" onChange={(event) => setDeployment((current) => ({ ...current, rateOverride: event.target.value }))} /></label>
          <label className="beta-form-field full">Eligible properties<select multiple value={deployment.propertyIds} onChange={(event) => setDeployment((current) => ({ ...current, propertyIds: [...event.target.selectedOptions].map((option) => option.value) }))}>{(selectedOrganization?.properties || []).map((property) => <option key={property._id} value={property._id}>{property.name}</option>)}</select></label>
          <div className="beta-card-actions full"><button className="beta-button" disabled={busy === "deployment"}>Save Deployment</button></div>
        </form>
        {data.deployments.length > 0 && <div className="beta-table-wrap"><table className="beta-data-table"><thead><tr><th>Resource</th><th>Organization</th><th>Scope</th><th>Rate</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.deployments.map((item) => {
          const resource = data.resources.find((candidate) => candidate._id === id(item.resourceProfileId));
          const propertyNames = (item.organizationId?.properties || []).filter((property) => (item.propertyIds || []).map(String).includes(String(property._id))).map((property) => property.name);
          return <tr key={item._id}><td>{resource?.displayName || "Resource"}</td><td>{item.organizationId?.name}</td><td>{propertyNames.length ? propertyNames.join(", ") : "All properties"}</td><td>{item.rateOverrideCents == null ? "Resource default" : money(item.rateOverrideCents)}</td><td>{item.status}</td><td>{item.status !== "ended" && <button className="beta-text-button" onClick={() => run(`deployment-${item._id}`, () => api.put(`/api/platform-resources/deployments/${item._id}`, { status: item.status === "active" ? "paused" : "active" }), "Deployment updated.")}>{item.status === "active" ? "Pause" : "Reactivate"}</button>}</td></tr>;
        })}</tbody></table></div>}
      </section>

      <section className="beta-panel">
        <div className="beta-section-heading"><div><p className="beta-eyebrow">Independent payable ledger</p><h2>Contractor Earnings</h2><p>Approve completed work, then group approved earnings for Gusto.</p></div></div>
        {data.earnings.length ? <div className="beta-table-wrap"><table className="beta-data-table">
          <thead><tr><th>Select</th><th>Resource</th><th>Organization</th><th>Earned</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{data.earnings.map((earning) => <tr key={earning._id}>
            <td><input aria-label={`Select earning for ${earning.resourceProfileId?.displayName || "resource"}`} type="checkbox" disabled={earning.status !== "approved"} checked={selectedEarnings.includes(earning._id)} onChange={(event) => setSelectedEarnings((current) => event.target.checked ? [...current, earning._id] : current.filter((value) => value !== earning._id))} /></td>
            <td>{earning.resourceProfileId?.displayName}</td>
            <td>{earning.organizationId?.name}</td>
            <td>{new Date(earning.earnedAt).toLocaleDateString()}</td>
            <td>{money(earning.grossAmountCents + (earning.reimbursementCents || 0), earning.currency)}</td>
            <td>{earning.status.replaceAll("_", " ")}</td>
            <td><div className="beta-card-actions">
              {earning.status === "pending_approval" && <button type="button" className="beta-text-button" onClick={() => run(`earning-${earning._id}`, () => api.post(`/api/platform-resources/earnings/${earning._id}/approve`, {}), "Earning approved.")}>Approve</button>}
              {["pending_approval", "approved"].includes(earning.status) && <button type="button" className="beta-text-button" onClick={() => { const reason = window.prompt("Why should this earning be voided?"); if (reason?.trim()) run(`earning-${earning._id}`, () => api.post(`/api/platform-resources/earnings/${earning._id}/void`, { reason: reason.trim() }), "Earning voided."); }}>Void</button>}
            </div></td>
          </tr>)}</tbody>
        </table></div> : <div className="beta-empty-state">No contractor earnings have been recorded.</div>}
        <form className="beta-form-grid platform-payout-form" onSubmit={createPayoutBatch}>
          <label className="beta-form-field">Gusto check date<input required type="date" value={checkDate} onChange={(event) => setCheckDate(event.target.value)} /></label>
          <div className="beta-card-actions"><button className="beta-button" disabled={!selectedEarnings.length || busy === "batch"}>Create Gusto Batch ({selectedEarnings.length})</button></div>
        </form>
        {approvedEarnings.length > 0 && <small>{approvedEarnings.length} approved earning{approvedEarnings.length === 1 ? " is" : "s are"} available for batching.</small>}
      </section>

      <section className="beta-panel">
        <div className="beta-section-heading"><div><p className="beta-eyebrow">Gusto reconciliation</p><h2>Payout Batches</h2><p>Use the Afterlight batch number as the Gusto invoice or memo reference, then mark the batch paid only after Gusto confirms processing.</p></div></div>
        {data.payoutBatches.length ? <div className="beta-resource-payout-list">{data.payoutBatches.map((batch) => <article key={batch._id}><div><strong>{batch.batchNumber}</strong><small>{new Date(batch.checkDate).toLocaleDateString()} · {batch.lines.length} contractor{batch.lines.length === 1 ? "" : "s"}</small></div><strong>{money(batch.totalAmountCents, batch.currency)}</strong><span className={`beta-status ${batch.status === "paid" ? "success" : "warning"}`}>{batch.status}</span>{batch.status === "ready" && <button className="beta-text-button" onClick={() => { const reference = window.prompt("Enter the Gusto submission reference. If Gusto does not show one, use the Afterlight batch number entered in Gusto:", batch.batchNumber); if (reference?.trim()) run(`batch-${batch._id}`, () => api.post(`/api/platform-resources/payout-batches/${batch._id}/record-submission`, { gustoSubmissionReference: reference.trim() }), "Gusto submission recorded."); }}>Record Gusto Submission</button>}{batch.status === "submitted" && <button className="beta-text-button" onClick={() => window.confirm("Does Gusto show this contractor payment as processed or paid?") && run(`batch-${batch._id}`, () => api.post(`/api/platform-resources/payout-batches/${batch._id}/mark-paid`, {}), "Payout batch marked paid.")}>Mark Paid</button>}</article>)}</div> : <div className="beta-empty-state">No Gusto payout batches have been created.</div>}
      </section>
    </div>
  );
}
