import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import ContextualHelpLink from "./help/ContextualHelpLink";

const MODEL_LABELS = {
  platform: "Full-stack SaaS",
  managed: "Managed service",
  hybrid: "Hybrid",
};

const TIER_LABELS = {
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3",
};

const STATUS_LABELS = {
  pending_review: "Pending review",
  information_requested: "Information requested",
  approved: "Approved",
  denied: "Denied",
  canceled: "Canceled",
};

function dateLabel(value) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" })
    : "Not specified";
}

function planLabel(request, requested = false) {
  const model = requested ? request.requestedServiceModel : request.currentServiceModel;
  const tier = requested ? request.requestedLicenseTier : request.currentLicenseTier;
  return `${MODEL_LABELS[model] || model}${tier ? ` ${TIER_LABELS[tier]}` : ""}`;
}

function capacityLabel(value) {
  if (value === undefined) return "Not recorded";
  return value === null ? "Unmetered" : value;
}

function requestTypeLabel(request) {
  if (request.changeType === "license_tier") return "Tier increase";
  if (request.changeType === "custom_capacity") return "Custom capacity";
  return "Service model";
}

function requestHeadline(request) {
  if (request.changeType === "custom_capacity") {
    return `${capacityLabel(request.organizationSnapshot?.currentAdminLimit)} → ${capacityLabel(request.organizationSnapshot?.requestedAdminLimit)} administrator seats`;
  }
  return `${planLabel(request)} → ${planLabel(request, true)}`;
}

function percentageLabel(value) {
  if (value === undefined) return "Not recorded";
  return value === null ? "None" : `${value}%`;
}

export default function PlatformServiceModelChanges() {
  const [requests, setRequests] = useState([]);
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await api.get("/api/service-model-changes/platform"));
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const orderedRequests = useMemo(() => [...requests].sort((left, right) => {
    const leftActive = ["pending_review", "information_requested"].includes(left.status) ? 0 : 1;
    const rightActive = ["pending_review", "information_requested"].includes(right.status) ? 0 : 1;
    return leftActive - rightActive || new Date(right.createdAt) - new Date(left.createdAt);
  }), [requests]);

  async function review(request, action) {
    if (busy) return;
    const response = String(responses[request._id] || "").trim();
    if (action !== "approve" && !response) {
      setError("Enter a platform response before denying or requesting information.");
      return;
    }
    setBusy(`${request._id}-${action}`);
    setError("");
    setMessage("");
    try {
      const updated = await api.post(`/api/service-model-changes/platform/${request._id}/review`, {
        action,
        response,
      });
      setRequests((current) => current.map((item) => item._id === request._id ? updated : item));
      setResponses((current) => ({ ...current, [request._id]: "" }));
      const decisionMessage = action === "approve"
        ? request.changeType === "license_tier"
          ? "License tier increase approved and applied."
          : request.changeType === "custom_capacity"
            ? "Custom administrator capacity approved and applied."
            : "Service model approved and applied to future assignments."
        : action === "deny"
          ? `${request.changeType === "license_tier" ? "License tier" : request.changeType === "custom_capacity" ? "Administrator capacity" : "Service model"} request denied.`
          : "More information requested from the organization.";
      setMessage(updated.emailDelivered === false
        ? `${decisionMessage} The requester email could not be delivered, but the decision remains recorded in Afterlight.`
        : decisionMessage);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="platform-service-model-changes">
      <section className="beta-panel">
        <div className="beta-section-heading platform-change-heading">
          <div>
            <p className="beta-eyebrow">Contract operations</p>
            <h2>Service Plan Requests</h2>
            <p>Review organization requests before changing contracted service delivery or licensed capacity.</p>
          </div>
          <ContextualHelpLink slug="review-service-model-change-requests" />
        </div>
      </section>
      {error && <p className="beta-alert error" role="alert">{error}</p>}
      {message && <p className="beta-alert success" role="status">{message}</p>}
      {loading ? <div className="beta-empty-state">Loading service plan requests...</div> : orderedRequests.length ? (
        <div className="platform-service-change-list">
          {orderedRequests.map((request) => {
            const active = ["pending_review", "information_requested"].includes(request.status);
            const actionBusy = busy.startsWith(`${request._id}-`);
            return (
              <article className="beta-panel platform-service-change" key={request._id}>
                <div className="beta-card-header">
                  <div>
                    <p className="beta-eyebrow">{request.organization?.name || "Customer organization"}</p>
                    <span className="beta-status">{requestTypeLabel(request)}</span>
                    <h3>{requestHeadline(request)}</h3>
                    <p>Requested by {request.requestedBy?.email || "organization administrator"} on {new Date(request.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={`beta-status ${request.status}`}>{STATUS_LABELS[request.status]}</span>
                </div>
                <dl className="beta-detail-list">
                  <div><dt>Proposed date</dt><dd>{dateLabel(request.proposedEffectiveDate)}</dd></div>
                  <div><dt>Properties</dt><dd>{request.organizationSnapshot?.propertyCount || 0}</dd></div>
                  <div><dt>Administrator capacity</dt><dd>{capacityLabel(request.organizationSnapshot?.currentAdminLimit)} → {capacityLabel(request.organizationSnapshot?.requestedAdminLimit)}</dd></div>
                  <div><dt>User capacity</dt><dd>{capacityLabel(request.organizationSnapshot?.currentUserLimit)} → {capacityLabel(request.organizationSnapshot?.requestedUserLimit)}</dd></div>
                  <div><dt>Property capacity</dt><dd>{capacityLabel(request.organizationSnapshot?.currentPropertyLimit)} → {capacityLabel(request.organizationSnapshot?.requestedPropertyLimit)}</dd></div>
                  {(request.organizationSnapshot?.currentAfterlightPortfolioMinimumPercent != null
                    || request.organizationSnapshot?.requestedAfterlightPortfolioMinimumPercent != null) && (
                    <div><dt>Afterlight portfolio minimum</dt><dd>{percentageLabel(request.organizationSnapshot?.currentAfterlightPortfolioMinimumPercent)} → {percentageLabel(request.organizationSnapshot?.requestedAfterlightPortfolioMinimumPercent)}</dd></div>
                  )}
                  <div><dt>Administrators allocated</dt><dd>{(request.organizationSnapshot?.activeAdministratorCount || 0) + (request.organizationSnapshot?.pendingAdministratorCount || 0)}</dd></div>
                  <div><dt>Users allocated</dt><dd>{(request.organizationSnapshot?.activeUserCount || 0) + (request.organizationSnapshot?.pendingUserCount || 0)}</dd></div>
                  {request.changeType === "service_model" && <div><dt>Property overrides</dt><dd>{request.organizationSnapshot?.propertyOverrideCount || 0}</dd></div>}
                  {request.changeType === "service_model" && <div><dt>Current default</dt><dd>{request.organizationSnapshot?.defaultFulfillmentSource || "Not recorded"}</dd></div>}
                </dl>
                <div className="beta-service-change-reason"><strong>Business reason</strong><p>{request.reason}</p></div>
                {request.notification?.platformEmailError && (
                  <p className="beta-alert warning">
                    <strong>Platform notification email failed:</strong> {request.notification.platformEmailError} The request remains available in this queue.
                  </p>
                )}
                {request.notification?.requesterEmailError && (
                  <p className="beta-alert warning">
                    <strong>Requester email failed:</strong> {request.notification.requesterEmailError} The decision remains recorded in Afterlight.
                  </p>
                )}
                {request.messages?.length > 1 && (
                  <details className="beta-service-change-thread">
                    <summary>Request conversation</summary>
                    {request.messages.map((entry) => (
                      <div key={entry._id || `${entry.createdAt}-${entry.actorScope}`}>
                        <strong>{entry.actorScope === "platform_admin" ? "Afterlight" : "Organization"}</strong>
                        <span>{new Date(entry.createdAt).toLocaleString()}</span>
                        <p>{entry.message}</p>
                      </div>
                    ))}
                  </details>
                )}
                {active && (
                  <>
                    <label className="beta-form-field">Platform response
                      <textarea maxLength="2000" value={responses[request._id] || ""}
                        placeholder="Required when denying or requesting more information; optional approval note."
                        onChange={(event) => setResponses((current) => ({ ...current, [request._id]: event.target.value }))} />
                    </label>
                    <p className="beta-field-help">{request.changeType === "license_tier"
                      ? "Approval applies the requested standard tier immediately without changing fulfillment policy, property overrides, assignments, or invoices."
                      : request.changeType === "custom_capacity"
                        ? "Approval changes only the organization's administrator-seat capacity. Its tier, user and property limits, fulfillment policy, assignments, and invoices remain unchanged."
                        : "Approval applies the requested model and tier immediately to future assignments, selects that model's standard fulfillment default, and clears property-level fulfillment overrides. Existing assignments and invoices keep their saved routing."}</p>
                    <div className="beta-card-actions">
                      <button type="button" className="beta-button" disabled={actionBusy} onClick={() => review(request, "approve")}>Approve and apply</button>
                      <button type="button" className="beta-button secondary" disabled={actionBusy} onClick={() => review(request, "request_information")}>Request more information</button>
                      <button type="button" className="beta-button danger" disabled={actionBusy} onClick={() => review(request, "deny")}>Deny</button>
                    </div>
                  </>
                )}
                {!active && request.platformResponse && <p className="beta-alert warning"><strong>Platform response:</strong> {request.platformResponse}</p>}
              </article>
            );
          })}
        </div>
      ) : <div className="beta-empty-state">No service plan change requests have been submitted.</div>}
    </div>
  );
}
