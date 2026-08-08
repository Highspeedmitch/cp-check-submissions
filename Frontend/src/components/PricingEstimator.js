import React, { useState } from "react";
import { api } from "../services/api";

const MAX_CLUSTER_PROPERTIES = 10;
let nextPropertyId = 1;

function emptyProperty() {
  return {
    id: `pricing-property-${nextPropertyId++}`,
    grossSquareFeet: "",
    propertyType: "free_standing",
  };
}

function emptyForm(pricingMode = "single") {
  return {
    pricingMode,
    serviceFrequency: "monthly",
    hasKnownIssues: false,
    withinHalfMile: false,
    sameScheduledVisit: false,
    properties: pricingMode === "cluster"
      ? [emptyProperty(), emptyProperty()]
      : [emptyProperty()],
  };
}

const MANUAL_REVIEW_LABELS = Object.freeze({
  property_size: "The property size requires a manual pricing review.",
  property_complexity: "The property complexity requires a manual pricing review.",
  service_frequency: "The requested service frequency requires a manual pricing review.",
  ad_hoc_frequency: "Ad-hoc work requires a manually prepared monthly estimate.",
  known_issues: "Known property concerns may affect the final scope and pricing.",
});

const PROPERTY_TYPE_LABELS = Object.freeze({
  free_standing: "Free standing",
  strip_mall: "Strip mall",
  individual_suite: "Individual suite",
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

function monthlySummary(estimate) {
  return estimate.estimatedMonthlyCents == null
    ? "Monthly pricing requires manual review"
    : `${formatCurrency(estimate.estimatedMonthlyCents)} estimated monthly`;
}

export function estimateSummaryText(form, estimate) {
  if (estimate.pricingMode === "cluster") {
    return [
      `Afterlight cluster planning estimate: ${estimate.inputs.propertyCount} properties, ${form.serviceFrequency.replaceAll("_", "-")} service.`,
      `${formatCurrency(estimate.estimatedPerVisitCents)} combined per visit; ${monthlySummary(estimate)}.`,
      `${formatCurrency(estimate.clusterDiscountPerVisitCents)} per-visit savings against ${formatCurrency(estimate.standalonePerVisitCents)} standalone.`,
      estimate.requiresManualReview
        ? "Manual pricing review required before presenting a quote."
        : "No automatic manual-review flags were identified.",
    ].join(" ");
  }
  const property = form.properties?.[0] || form;
  const propertyType = property.propertyType.replaceAll("_", " ");
  const frequency = form.serviceFrequency.replaceAll("_", "-");
  return [
    `Afterlight planning estimate: ${Number(property.grossSquareFeet).toLocaleString()} sq ft ${propertyType}, ${frequency} service.`,
    `${formatCurrency(estimate.estimatedPerVisitCents)} estimated per visit; ${monthlySummary(estimate)}.`,
    estimate.requiresManualReview
      ? "Manual pricing review required before presenting a quote."
      : "No automatic manual-review flags were identified.",
  ].join(" ");
}

export default function PricingEstimator() {
  const [form, setForm] = useState(() => emptyForm());
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const clusterMode = form.pricingMode === "cluster";

  function clearResult() {
    setEstimate(null);
    setError("");
    setMessage("");
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    clearResult();
  }

  function updateMode(pricingMode) {
    setForm((current) => ({
      ...current,
      pricingMode,
      withinHalfMile: false,
      sameScheduledVisit: false,
      properties: pricingMode === "cluster"
        ? current.properties.length >= 2
          ? current.properties
          : [...current.properties, emptyProperty()]
        : [current.properties[0] || emptyProperty()],
    }));
    clearResult();
  }

  function updateProperty(propertyId, field, value) {
    setForm((current) => ({
      ...current,
      properties: current.properties.map((property) => (
        property.id === propertyId ? { ...property, [field]: value } : property
      )),
    }));
    clearResult();
  }

  function addProperty() {
    if (form.properties.length >= MAX_CLUSTER_PROPERTIES) return;
    setForm((current) => ({
      ...current,
      properties: [...current.properties, emptyProperty()],
    }));
    clearResult();
  }

  function removeProperty(propertyId) {
    if (form.properties.length <= 2) return;
    setForm((current) => ({
      ...current,
      properties: current.properties.filter((property) => property.id !== propertyId),
    }));
    clearResult();
  }

  async function calculate(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setEstimate(null);
    setError("");
    setMessage("");
    const properties = form.properties.map(({ grossSquareFeet, propertyType }) => ({
      grossSquareFeet: Number(grossSquareFeet),
      propertyType,
    }));
    const payload = clusterMode
      ? {
        pricingMode: "cluster",
        properties,
        serviceFrequency: form.serviceFrequency,
        hasKnownIssues: form.hasKnownIssues,
        withinHalfMile: form.withinHalfMile,
        sameScheduledVisit: form.sameScheduledVisit,
      }
      : {
        grossSquareFeet: properties[0].grossSquareFeet,
        propertyType: properties[0].propertyType,
        serviceFrequency: form.serviceFrequency,
        hasKnownIssues: form.hasKnownIssues,
      };
    try {
      setEstimate(await api.post("/api/platform/pricing-estimate", payload));
    } catch (requestError) {
      setError(requestError.message || "Unable to calculate the pricing estimate.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm(emptyForm());
    clearResult();
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

      <form className="beta-panel platform-pricing-form" onSubmit={calculate}>
        <fieldset className="platform-pricing-mode">
          <legend>Estimate type</legend>
          <label>
            <input type="radio" name="pricing-mode" value="single" checked={!clusterMode}
              onChange={() => updateMode("single")} />
            <span><strong>Single property</strong><small>Calculate one property independently.</small></span>
          </label>
          <label>
            <input type="radio" name="pricing-mode" value="cluster" checked={clusterMode}
              onChange={() => updateMode("cluster")} />
            <span><strong>Property cluster</strong><small>Share visit overhead across nearby properties.</small></span>
          </label>
        </fieldset>

        <div className={clusterMode ? "platform-pricing-properties" : "beta-form-grid"}>
          {form.properties.map((property, index) => (
            <section className={clusterMode ? "platform-pricing-property" : "platform-pricing-single-property"}
              key={property.id} aria-labelledby={clusterMode ? `${property.id}-title` : undefined}>
              {clusterMode && (
                <div className="platform-pricing-property-heading">
                  <h3 id={`${property.id}-title`}>Property {index + 1}</h3>
                  {form.properties.length > 2 && (
                    <button type="button" className="beta-button secondary compact"
                      onClick={() => removeProperty(property.id)}>
                      Remove
                    </button>
                  )}
                </div>
              )}
              <label className="beta-form-field">
                {clusterMode ? `Property ${index + 1} gross square footage` : "Gross square footage"}
                <input type="number" min="1" step="1" required value={property.grossSquareFeet}
                  onChange={(event) => updateProperty(property.id, "grossSquareFeet", event.target.value)} />
              </label>
              <label className="beta-form-field">
                {clusterMode ? `Property ${index + 1} type` : "Property type"}
                <select value={property.propertyType}
                  onChange={(event) => updateProperty(property.id, "propertyType", event.target.value)}>
                  {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
            </section>
          ))}
        </div>

        {clusterMode && (
          <div className="platform-pricing-cluster-controls">
            <button type="button" className="beta-button secondary" onClick={addProperty}
              disabled={form.properties.length >= MAX_CLUSTER_PROPERTIES || busy}>
              Add property
            </button>
            <span>{form.properties.length} of {MAX_CLUSTER_PROPERTIES} properties</span>
          </div>
        )}

        <div className="beta-form-grid platform-pricing-shared-fields">
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
        </div>

        {clusterMode && (
          <fieldset className="platform-pricing-eligibility">
            <legend>Cluster eligibility</legend>
            <p>Both conditions must be true. Distance alone does not qualify separate service visits for a discount.</p>
            <label className="beta-template-checkbox">
              <input type="checkbox" required checked={form.withinHalfMile}
                onChange={(event) => update("withinHalfMile", event.target.checked)} />
              Every property is within 0.5 mile of the primary property
            </label>
            <label className="beta-template-checkbox">
              <input type="checkbox" required checked={form.sameScheduledVisit}
                onChange={(event) => update("sameScheduledVisit", event.target.checked)} />
              Every property will be serviced during the same scheduled visit
            </label>
          </fieldset>
        )}

        <div className="beta-card-actions platform-pricing-actions">
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
              <h2 id="platform-pricing-result-title">
                {estimate.pricingMode === "cluster" ? "Cluster planning estimate" : "Planning estimate"}
              </h2>
            </div>
            <button type="button" className="beta-button secondary compact" onClick={copySummary}>
              Copy summary
            </button>
          </div>
          <div className={`platform-pricing-metrics${estimate.pricingMode === "cluster" ? " cluster" : ""}`}>
            <article>
              <span>{estimate.pricingMode === "cluster" ? "Combined per visit" : "Estimated per visit"}</span>
              <strong>{formatCurrency(estimate.estimatedPerVisitCents)}</strong>
            </article>
            <article>
              <span>{estimate.pricingMode === "cluster" ? "Combined monthly" : "Estimated monthly"}</span>
              <strong>{estimate.estimatedMonthlyCents == null
                ? "Manual review"
                : formatCurrency(estimate.estimatedMonthlyCents)}</strong>
            </article>
            {estimate.pricingMode === "cluster" && (
              <>
                <article>
                  <span>Standalone per-visit total</span>
                  <strong>{formatCurrency(estimate.standalonePerVisitCents)}</strong>
                </article>
                <article className="platform-pricing-savings">
                  <span>Cluster savings per visit</span>
                  <strong>{formatCurrency(estimate.clusterDiscountPerVisitCents)}</strong>
                </article>
              </>
            )}
          </div>

          {estimate.pricingMode === "cluster" && (
            <div className="platform-pricing-breakdown">
              <div className="platform-pricing-breakdown-heading">
                <div><h3>Property breakdown</h3><p>The highest standalone estimate is the primary property.</p></div>
                <span className="beta-status configured">Additional properties at 50%</span>
              </div>
              <div className="platform-pricing-table-wrap">
                <table>
                  <thead><tr><th>Property</th><th>Size</th><th>Type</th><th>Standalone</th></tr></thead>
                  <tbody>
                    {estimate.properties.map((property) => (
                      <tr key={property.index}>
                        <td>Property {property.index + 1}{property.index === estimate.inputs.primaryPropertyIndex && <strong>Primary</strong>}</td>
                        <td>{Number(property.grossSquareFeet).toLocaleString()} sq ft</td>
                        <td>{PROPERTY_TYPE_LABELS[property.propertyType] || property.propertyType}</td>
                        <td>{formatCurrency(property.standalonePerVisitCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
            {estimate.pricingMode === "cluster" ? (
              <dl>
                <div><dt>Properties</dt><dd>{estimate.inputs.propertyCount}</dd></div>
                <div><dt>Additional-property rate</dt><dd>{estimate.inputs.additionalPropertyMultiplier * 100}%</dd></div>
                <div><dt>Maximum distance</dt><dd>{estimate.inputs.clusterDistanceMiles} mile</dd></div>
                <div><dt>Visits per month</dt><dd>{estimate.inputs.visitsPerMonth}</dd></div>
                <div><dt>Frequency modifier</dt><dd>{formatMultiplier(estimate.inputs.frequencyMultiplier)}</dd></div>
              </dl>
            ) : (
              <dl>
                <div><dt>Pricing size basis</dt><dd>{Number(estimate.inputs.normalizedSquareFeet).toLocaleString()} sq ft</dd></div>
                <div><dt>Property modifier</dt><dd>{formatMultiplier(estimate.inputs.complexityModifier)}</dd></div>
                <div><dt>Visits per month</dt><dd>{estimate.inputs.visitsPerMonth}</dd></div>
                <div><dt>Frequency modifier</dt><dd>{formatMultiplier(estimate.inputs.frequencyMultiplier)}</dd></div>
              </dl>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
