import React, { useState } from "react";
import { api } from "../services/api";

const EMPTY_FORM = Object.freeze({
  grossSquareFeet: "",
  propertyType: "free_standing",
  serviceFrequency: "monthly",
  hasKnownIssues: false,
});

const MANUAL_REVIEW_LABELS = Object.freeze({
  property_size: "The property size requires a manual pricing review.",
  property_complexity: "The property complexity requires a manual pricing review.",
  service_frequency: "The requested service frequency requires a manual pricing review.",
  ad_hoc_frequency: "Ad-hoc work requires a manually prepared monthly estimate.",
  known_issues: "Known property concerns may affect the final scope and pricing.",
});

function formatCurrency(cents) {
  if (!Number.isFinite(Number(cents))) return "Not calculated";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

function formatMultiplier(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}x` : "N/A";
}

export function estimateSummaryText(form, estimate) {
  const propertyType = form.propertyType.replaceAll("_", " ");
  const frequency = form.serviceFrequency.replaceAll("_", "-");
  const monthly = estimate.estimatedMonthlyCents == null
    ? "Monthly pricing requires manual review"
    : `${formatCurrency(estimate.estimatedMonthlyCents)} estimated monthly`;
  return [
    `Afterlight planning estimate: ${Number(form.grossSquareFeet).toLocaleString()} sq ft ${propertyType}, ${frequency} service.`,
    `${formatCurrency(estimate.estimatedPerVisitCents)} estimated per visit; ${monthly}.`,
    estimate.requiresManualReview
      ? "Manual pricing review required before presenting a quote."
      : "No automatic manual-review flags were identified.",
  ].join(" ");
}

export default function PricingEstimator() {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setEstimate(null);
    setError("");
    setMessage("");
  }

  async function calculate(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setEstimate(null);
    setError("");
    setMessage("");
    try {
      setEstimate(await api.post("/api/platform/pricing-estimate", {
        grossSquareFeet: Number(form.grossSquareFeet),
        propertyType: form.propertyType,
        serviceFrequency: form.serviceFrequency,
        hasKnownIssues: form.hasKnownIssues,
      }));
    } catch (requestError) {
      setError(requestError.message || "Unable to calculate the pricing estimate.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm({ ...EMPTY_FORM });
    setEstimate(null);
    setError("");
    setMessage("");
  }

  async function copySummary() {
    if (!estimate) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(estimateSummaryText(form, estimate));
      setMessage("Estimate summary copied.");
      setError("");
    } catch (_copyError) {
      setMessage("");
      setError("Unable to copy the estimate. Select the displayed values instead.");
    }
  }

  return (
    <section className="platform-pricing-estimator" aria-labelledby="platform-pricing-title">
      <div className="beta-section-heading">
        <div>
          <h2 id="platform-pricing-title">Pricing estimator</h2>
          <p>Run an internal planning calculation without creating a bid request or saving prospect information.</p>
        </div>
      </div>

      <div className="beta-alert warning platform-pricing-disclaimer" role="note">
        This is a preliminary client-pricing estimate, not an approved quote or an internal labor-cost calculation.
      </div>

      <form className="beta-panel beta-form-grid platform-pricing-form" onSubmit={calculate}>
        <label className="beta-form-field">
          Gross square footage
          <input type="number" min="1" step="1" required value={form.grossSquareFeet}
            onChange={(event) => update("grossSquareFeet", event.target.value)} />
        </label>
        <label className="beta-form-field">
          Property type
          <select value={form.propertyType}
            onChange={(event) => update("propertyType", event.target.value)}>
            <option value="free_standing">Free standing</option>
            <option value="strip_mall">Strip mall</option>
            <option value="individual_suite">Individual suite</option>
          </select>
        </label>
        <label className="beta-form-field">
          Service frequency
          <select value={form.serviceFrequency}
            onChange={(event) => update("serviceFrequency", event.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="ad_hoc">Ad-hoc</option>
          </select>
        </label>
        <label className="beta-template-checkbox platform-pricing-known-issues">
          <input type="checkbox" checked={form.hasKnownIssues}
            onChange={(event) => update("hasKnownIssues", event.target.checked)} />
          Known site concerns are expected
        </label>
        <div className="beta-card-actions full platform-pricing-actions">
          <button type="button" className="beta-button secondary" onClick={reset} disabled={busy}>Reset</button>
          <button type="submit" className="beta-button" disabled={busy}>
            {busy ? "Calculating..." : "Calculate estimate"}
          </button>
        </div>
      </form>

      {error && <p className="beta-alert error" role="alert">{error}</p>}
      {message && <p className="beta-alert success" role="status">{message}</p>}

      {estimate && (
        <section className="beta-panel platform-pricing-result" aria-labelledby="platform-pricing-result-title">
          <div className="beta-section-heading">
            <div>
              <span className="beta-eyebrow">Formula version {estimate.version}</span>
              <h2 id="platform-pricing-result-title">Planning estimate</h2>
            </div>
            <button type="button" className="beta-button secondary compact" onClick={copySummary}>
              Copy summary
            </button>
          </div>
          <div className="platform-pricing-metrics">
            <article>
              <span>Estimated per visit</span>
              <strong>{formatCurrency(estimate.estimatedPerVisitCents)}</strong>
            </article>
            <article>
              <span>Estimated monthly</span>
              <strong>{estimate.estimatedMonthlyCents == null
                ? "Manual review"
                : formatCurrency(estimate.estimatedMonthlyCents)}</strong>
            </article>
          </div>

          {estimate.requiresManualReview && (
            <div className="beta-alert warning platform-pricing-review" role="status">
              <strong>Manual pricing review required</strong>
              <ul>
                {(estimate.manualReviewReasons || []).map((reason) => (
                  <li key={reason}>{MANUAL_REVIEW_LABELS[reason] || reason.replaceAll("_", " ")}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="platform-pricing-assumptions">
            <h3>Calculation assumptions</h3>
            <dl>
              <div><dt>Pricing size basis</dt><dd>{Number(estimate.inputs.normalizedSquareFeet).toLocaleString()} sq ft</dd></div>
              <div><dt>Property modifier</dt><dd>{formatMultiplier(estimate.inputs.complexityModifier)}</dd></div>
              <div><dt>Visits per month</dt><dd>{estimate.inputs.visitsPerMonth}</dd></div>
              <div><dt>Frequency modifier</dt><dd>{formatMultiplier(estimate.inputs.frequencyMultiplier)}</dd></div>
            </dl>
          </div>
        </section>
      )}
    </section>
  );
}
