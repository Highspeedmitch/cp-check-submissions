import React, { useState } from "react";
import { api } from "../services/api";
import BoutiquePricingDialog from "./BoutiquePricingDialog";

const MAX_ROUTE_PROPERTIES = 6;
const MAX_CLUSTER_PROPERTIES = MAX_ROUTE_PROPERTIES;
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
    organizationId: "",
    routeId: "",
    proposedAddress: "",
    candidateLocationId: "",
    candidateLat: "",
    candidateLng: "",
    routeCommitment: "modeled",
    serviceFrequency: "monthly",
    hasKnownIssues: false,
    includeManagedServiceFee: false,
    managedServiceTier: "tier_1",
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
  modeled_route_data: "Road routing is not yet configured, so this estimate uses a coordinate-based route model.",
  routing_provider_fallback: "Live road routing was unavailable, so this estimate uses the coordinate fallback and requires review.",
  travel_distance: "The home-base trip exceeds the automatic travel range and requires review.",
});

const PROPERTY_TYPE_LABELS = Object.freeze({
  free_standing: "Free standing",
  strip_mall: "Strip mall",
  individual_suite: "Individual suite",
});

const ROUTE_PRICING_BAND_LABELS = Object.freeze({
  direct_route: "Direct-route marginal price",
  near_route: "Near-route price",
  standard_route: "Standard route price",
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
    : `${formatCurrency(estimate.estimatedMonthlyCents)} estimated monthly for visit service`;
}

function managedServiceSummary(estimate) {
  if (!estimate.managedService) return null;
  if (!estimate.managedService.includedInContractTotal) {
    return `${formatCurrency(estimate.managedService.baseMonthlyFeeCents)} organization-level managed-service base not included.`;
  }
  return estimate.managedService.estimatedContractMonthlyCents == null
    ? `${formatCurrency(estimate.managedService.baseMonthlyFeeCents)} organization-level managed-service base included; contract monthly total requires manual review.`
    : `${formatCurrency(estimate.managedService.baseMonthlyFeeCents)} organization-level managed-service base included; ${formatCurrency(estimate.managedService.estimatedContractMonthlyCents)} estimated contract total per month.`;
}

export function estimateSummaryText(form, estimate) {
  if (estimate.pricingMode === "cluster") {
    return [
      `Afterlight cluster planning estimate: ${estimate.inputs.propertyCount} properties, ${form.serviceFrequency.replaceAll("_", "-")} service.`,
      `${formatCurrency(estimate.estimatedPerVisitCents)} combined per visit; ${monthlySummary(estimate)}.`,
      `${formatCurrency(estimate.clusterDiscountPerVisitCents)} per-visit savings against ${formatCurrency(estimate.standalonePerVisitCents)} standalone.`,
      managedServiceSummary(estimate),
      estimate.requiresManualReview
        ? "Manual pricing review required before presenting a quote."
        : "No automatic manual-review flags were identified.",
    ].filter(Boolean).join(" ");
  }
  if (estimate.pricingMode === "route_aware") {
    const selectedRoute = estimate.geography?.route;
    const routeScope = selectedRoute?.source === "saved_route"
      ? `${selectedRoute.routeName} route${selectedRoute.routeRegion ? ` (${selectedRoute.routeRegion})` : ""}`
      : "a standalone trip or new route";
    return [
      `Afterlight route-aware planning estimate for ${form.proposedAddress || "the proposed property"} using ${routeScope}.`,
      `${formatCurrency(estimate.estimatedPerVisitCents)} estimated per visit; ${monthlySummary(estimate)}.`,
      `${formatCurrency(estimate.travelSurchargeCents)} travel adjustment and ${formatCurrency(estimate.combinedCreditCents)} route/density credit.`,
      `Route classification: ${ROUTE_PRICING_BAND_LABELS[estimate.geography?.route?.pricingBand] || "Standard route price"}.`,
      managedServiceSummary(estimate),
      estimate.requiresManualReview
        ? "Manual pricing review required before presenting a quote."
        : "No automatic manual-review flags were identified.",
    ].filter(Boolean).join(" ");
  }
  const property = form.properties?.[0] || form;
  const propertyType = property.propertyType.replaceAll("_", " ");
  const frequency = form.serviceFrequency.replaceAll("_", "-");
  return [
    `Afterlight planning estimate: ${Number(property.grossSquareFeet).toLocaleString()} sq ft ${propertyType}, ${frequency} service.`,
    `${formatCurrency(estimate.estimatedPerVisitCents)} estimated per visit; ${monthlySummary(estimate)}.`,
    managedServiceSummary(estimate),
    estimate.requiresManualReview
      ? "Manual pricing review required before presenting a quote."
      : "No automatic manual-review flags were identified.",
  ].filter(Boolean).join(" ");
}

export default function PricingEstimator({ organizations = [] }) {
  const [form, setForm] = useState(() => emptyForm());
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationResults, setLocationResults] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [boutiqueOpen, setBoutiqueOpen] = useState(false);
  const clusterMode = form.pricingMode === "cluster";
  const routeAwareMode = form.pricingMode === "route_aware";
  const selectedOrganization = organizations.find(
    (organization) => String(organization.organizationId) === String(form.organizationId)
  );
  const availableRoutes = selectedOrganization?.routes || [];
  const selectedRoute = availableRoutes.find(
    (route) => String(route.routeId) === String(form.routeId)
  );

  function clearResult() {
    setEstimate(null);
    setError("");
    setMessage("");
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    clearResult();
  }

  function updateOrganization(organizationId) {
    setForm((current) => ({
      ...current,
      organizationId,
      routeId: "",
      routeCommitment: "modeled",
    }));
    clearResult();
  }

  function updateAddress(value) {
    setForm((current) => ({
      ...current,
      proposedAddress: value,
      candidateLocationId: "",
      candidateLat: "",
      candidateLng: "",
    }));
    setLocationResults([]);
    clearResult();
  }

  function chooseLocation(location) {
    setForm((current) => ({
      ...current,
      proposedAddress: location.label,
      candidateLocationId: location.locationId,
      candidateLat: location.lat,
      candidateLng: location.lng,
    }));
    setEstimate(null);
    setError("");
    setMessage("Property location confirmed.");
  }

  async function searchAddress() {
    if (locationBusy || !form.proposedAddress.trim()) return;
    setLocationBusy(true);
    setLocationResults([]);
    setEstimate(null);
    setError("");
    setMessage("");
    try {
      const result = await api.post("/api/platform/pricing-locations", {
        query: form.proposedAddress,
      });
      const results = Array.isArray(result.results) ? result.results : [];
      if (!results.length) {
        setError("No matching property address was found. Refine the address and try again.");
        return;
      }
      setLocationResults(results);
      setMessage("Select the correct address before calculating the estimate.");
    } catch (requestError) {
      setError(requestError.message || "Unable to search for the property address.");
    } finally {
      setLocationBusy(false);
    }
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
    setLocationResults([]);
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
    if (routeAwareMode && (
      !form.candidateLocationId
      || form.candidateLat === ""
      || form.candidateLng === ""
    )) {
      setError("Find and confirm the proposed property address before calculating.");
      setMessage("");
      return;
    }
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
        includeManagedServiceFee: form.includeManagedServiceFee,
        managedServiceTier: form.managedServiceTier,
      }
      : routeAwareMode ? {
        pricingMode: "route_aware",
        organizationId: form.organizationId,
        routeId: form.routeId || null,
        candidate: {
          id: form.candidateLocationId,
          name: form.proposedAddress,
          lat: Number(form.candidateLat),
          lng: Number(form.candidateLng),
        },
        routeCommitment: form.routeId ? form.routeCommitment : "none",
        grossSquareFeet: properties[0].grossSquareFeet,
        propertyType: properties[0].propertyType,
        serviceFrequency: form.serviceFrequency,
        hasKnownIssues: form.hasKnownIssues,
        includeManagedServiceFee: form.includeManagedServiceFee,
        managedServiceTier: form.managedServiceTier,
      } : {
        grossSquareFeet: properties[0].grossSquareFeet,
        propertyType: properties[0].propertyType,
        serviceFrequency: form.serviceFrequency,
        hasKnownIssues: form.hasKnownIssues,
        includeManagedServiceFee: form.includeManagedServiceFee,
        managedServiceTier: form.managedServiceTier,
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
    setLocationResults([]);
    setLocationBusy(false);
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
            <input type="radio" name="pricing-mode" value="single" checked={form.pricingMode === "single"}
              onChange={() => updateMode("single")} />
            <span><strong>Single property</strong><small>Calculate one property independently.</small></span>
          </label>
          <label>
            <input type="radio" name="pricing-mode" value="cluster" checked={clusterMode}
              onChange={() => updateMode("cluster")} />
            <span><strong>Property cluster</strong><small>Share visit overhead across nearby properties.</small></span>
          </label>
          <label>
            <input type="radio" name="pricing-mode" value="route_aware" checked={routeAwareMode}
              onChange={() => updateMode("route_aware")} />
            <span><strong>Route-aware property</strong><small>Price a saved route insertion or a standalone trip.</small></span>
          </label>
          <button type="button" className="platform-pricing-mode-button" onClick={() => setBoutiqueOpen(true)}>
            <span><strong>Boutique</strong><small>Price one to three sub-5,000 sq ft properties with the $75 monthly fee.</small></span>
          </button>
        </fieldset>

        {routeAwareMode && (
          <section className="platform-pricing-route-context" aria-labelledby="platform-pricing-route-title">
            <div className="platform-pricing-property-heading">
              <div>
                <h3 id="platform-pricing-route-title">Route context</h3>
                <p>Select the active route this property may join, or price it as a standalone trip/new route. Region by itself does not create a route credit.</p>
              </div>
            </div>
            <div className="beta-form-grid">
              <label className="beta-form-field">
                Organization
                <select required value={form.organizationId}
                  onChange={(event) => updateOrganization(event.target.value)}>
                  <option value="">Select organization</option>
                  {organizations.map((organization) => (
                    <option value={organization.organizationId} key={organization.organizationId}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="beta-form-field">
                Pricing route
                <select value={form.routeId} disabled={!form.organizationId}
                  onChange={(event) => update("routeId", event.target.value)}>
                  <option value="">Standalone trip / new route</option>
                  {availableRoutes.map((route) => (
                    <option value={route.routeId} key={route.routeId}
                      disabled={route.stopCount >= MAX_ROUTE_PROPERTIES}>
                      {route.name} ({route.stopCount}/{MAX_ROUTE_PROPERTIES} stops{route.region ? ` - ${route.region}` : ""})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {form.routeId ? (
              <div className="beta-form-grid">
                <label className="beta-form-field">
                  Route confidence
                  <select value={form.routeCommitment}
                    onChange={(event) => update("routeCommitment", event.target.value)}>
                    <option value="modeled">Modeled future route</option>
                    <option value="confirmed">Confirmed same-day route</option>
                  </select>
                </label>
                <p className="platform-pricing-location-confirmed" role="status">
                  {selectedRoute?.name || "Selected route"} has {selectedRoute?.stopCount || 0} saved stops;
                  the proposed property would become stop {(selectedRoute?.stopCount || 0) + 1} of {MAX_ROUTE_PROPERTIES}.
                </p>
              </div>
            ) : (
              <p className="platform-pricing-location-confirmed" role="status">
                Standalone pricing receives no saved-route or route-density credit.
              </p>
            )}
            <div className="platform-pricing-address-search">
              <label className="beta-form-field" htmlFor="platform-pricing-address">
                Proposed property address
                <input id="platform-pricing-address" type="text" required maxLength="240"
                  value={form.proposedAddress}
                  onChange={(event) => updateAddress(event.target.value)} />
              </label>
              <button type="button" className="beta-button secondary"
                disabled={locationBusy || busy || !form.proposedAddress.trim()}
                onClick={searchAddress}>
                {locationBusy ? "Finding address..." : "Find address"}
              </button>
            </div>
            {locationResults.length > 0 && (
              <fieldset className="platform-pricing-location-results">
                <legend>Confirm the proposed property</legend>
                {locationResults.map((location) => (
                  <label key={location.locationId}>
                    <input type="radio" name="pricing-location"
                      checked={form.candidateLocationId === location.locationId}
                      onChange={() => chooseLocation(location)} />
                    <span>
                      <strong>{location.label}</strong>
                      <small>Mapbox match: {location.confidence}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {form.candidateLocationId && (
              <p className="platform-pricing-location-confirmed" role="status">
                Confirmed location: {form.proposedAddress}
              </p>
            )}
          </section>
        )}

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

        <fieldset className="platform-pricing-eligibility">
          <legend>Managed-service agreement</legend>
          <p>The base applies once per organization, not once per property.</p>
          <label className="beta-template-checkbox">
            <input type="checkbox" checked={form.includeManagedServiceFee}
              onChange={(event) => update("includeManagedServiceFee", event.target.checked)} />
            Include the organization-level Managed Service fee in this quote
          </label>
          {form.includeManagedServiceFee && (
            <label className="beta-form-field">
              Managed Service tier
              <select value={form.managedServiceTier}
                onChange={(event) => update("managedServiceTier", event.target.value)}>
                <option value="tier_1">Tier 1 · $500/month · up to 25 properties</option>
                <option value="tier_2">Tier 2 · $1,250/month · up to 75 properties</option>
                <option value="tier_3">Tier 3 · $2,500/month · up to 250 properties</option>
              </select>
            </label>
          )}
          <p>Leave this off when pricing an added property for an organization that already pays the monthly base.</p>
        </fieldset>

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
          <button type="button" className="beta-button secondary" onClick={reset}
            disabled={busy || locationBusy}>Reset</button>
          <button type="submit" className="beta-button" disabled={busy || locationBusy}>
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
                {estimate.pricingMode === "cluster"
                  ? "Cluster planning estimate"
                  : estimate.pricingMode === "route_aware"
                    ? "Route-aware planning estimate"
                    : "Planning estimate"}
              </h2>
            </div>
            <button type="button" className="beta-button secondary compact" onClick={copySummary}>
              Copy summary
            </button>
          </div>
          <div className={`platform-pricing-metrics${estimate.pricingMode === "cluster" ? " cluster" : estimate.pricingMode === "route_aware" ? " route-aware" : ""}`}>
            <article>
              <span>{estimate.pricingMode === "cluster" ? "Combined per visit" : "Estimated per visit"}</span>
              <strong>{formatCurrency(estimate.estimatedPerVisitCents)}</strong>
            </article>
            <article>
              <span>{estimate.pricingMode === "cluster" ? "Combined visit-service monthly" : "Visit-service monthly"}</span>
              <strong>{estimate.estimatedMonthlyCents == null
                ? "Manual review"
                : formatCurrency(estimate.estimatedMonthlyCents)}</strong>
            </article>
            {estimate.managedService?.includedInContractTotal && (
              <>
                <article>
                  <span>Managed-service base</span>
                  <strong>{formatCurrency(estimate.managedService.baseMonthlyFeeCents)}</strong>
                </article>
                <article>
                  <span>Contract monthly total</span>
                  <strong>{estimate.managedService.estimatedContractMonthlyCents == null
                    ? "Manual review"
                    : formatCurrency(estimate.managedService.estimatedContractMonthlyCents)}</strong>
                </article>
              </>
            )}
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
            {estimate.pricingMode === "route_aware" && (
              <>
                <article>
                  <span>Base property work</span>
                  <strong>{formatCurrency(estimate.basePerVisitCents)}</strong>
                </article>
                <article>
                  <span>Travel adjustment</span>
                  <strong>{formatCurrency(estimate.travelSurchargeCents)}</strong>
                </article>
                <article className="platform-pricing-savings">
                  <span>Route and density credit</span>
                  <strong>{formatCurrency(estimate.combinedCreditCents)}</strong>
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

          {estimate.pricingMode === "route_aware" && (
            <div className="platform-pricing-breakdown platform-pricing-route-breakdown">
              <div className="platform-pricing-breakdown-heading">
                <div>
                  <h3>Geographic factor breakdown</h3>
                  <p>Home-base location remains backend-only; this view exposes only operational travel metrics.</p>
                </div>
                <span className="beta-status configured">
                  {estimate.geography.method === "road_matrix" ? "Road matrix" : "Coordinate fallback"}
                </span>
              </div>
              <dl className="platform-pricing-route-factors">
                <div><dt>Confirmed property</dt><dd>{estimate.geography.candidate?.name || form.proposedAddress}</dd></div>
                <div><dt>Home round trip</dt><dd>{estimate.geography.home.roundTripMiles} mi · {estimate.geography.home.roundTripMinutes} min</dd></div>
                <div><dt>Route scope</dt><dd>{estimate.geography.route.source === "saved_route"
                  ? `${estimate.geography.route.routeName}${estimate.geography.route.routeRegion ? ` - ${estimate.geography.route.routeRegion}` : ""} (v${estimate.geography.route.routeVersion})`
                  : "Standalone trip / new route"}</dd></div>
                <div><dt>Saved route stops</dt><dd>{estimate.geography.route.stopCount} of {estimate.geography.route.maximumStops}</dd></div>
                <div><dt>Nearest route property</dt><dd>{estimate.geography.portfolio.nearestPropertyDistanceMiles == null
                  ? "None available"
                  : `${estimate.geography.portfolio.nearestPropertyDistanceMiles} mi`}</dd></div>
                <div><dt>Selected-route density</dt><dd>{Math.round(estimate.geography.portfolio.densityScore * 100)}%</dd></div>
                <div><dt>Marginal route detour</dt><dd>{estimate.geography.route.additionalMiles} mi · {estimate.geography.route.additionalMinutes} min</dd></div>
                <div><dt>Route confidence</dt><dd>{Math.round(estimate.geography.route.confidence * 100)}%</dd></div>
                <div><dt>Route fit</dt><dd>{Math.round((estimate.geography.route.fitScore || 0) * 100)}% · {ROUTE_PRICING_BAND_LABELS[estimate.geography.route.pricingBand] || "Standard route price"}</dd></div>
                <div><dt>Insertion point</dt><dd>{estimate.geography.route.insertionAfterPropertyName || "Operations base"} → {estimate.geography.route.insertionBeforePropertyName || "Operations base"}</dd></div>
                <div><dt>Saved route order</dt><dd>{estimate.geography.route.modeledStopNames?.length
                  ? estimate.geography.route.modeledStopNames.join(" → ")
                  : "No saved route stops"}</dd></div>
                <div><dt>Credit detail</dt><dd>{formatCurrency(estimate.routeCreditCents)} route · {formatCurrency(estimate.portfolioCreditCents)} selected-route density</dd></div>
              </dl>
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
            ) : estimate.pricingMode === "route_aware" ? (
              <dl>
                <div><dt>Standalone minimum</dt><dd>{formatCurrency(estimate.inputs.minimumPerVisitCents)}</dd></div>
                <div><dt>Retail-center size benchmark</dt><dd>{formatCurrency(estimate.inputs.sizeBenchmarkPerVisitCents)}</dd></div>
                <div><dt>Included round trip</dt><dd>{estimate.inputs.travelPolicy.includedRoundTripMiles} mi / {estimate.inputs.travelPolicy.includedRoundTripMinutes} min</dd></div>
                <div><dt>Route savings passed through</dt><dd>{Math.round(estimate.inputs.travelPolicy.routeSavingsPassThroughRate * 100)}%</dd></div>
                <div><dt>Maximum direct-route credit</dt><dd>{Math.round((estimate.inputs.travelPolicy.maximumRouteFitCreditRate || 0) * 100)}%</dd></div>
                <div><dt>Maximum portfolio-density credit</dt><dd>{Math.round(estimate.inputs.travelPolicy.maximumPortfolioCreditRate * 100)}%</dd></div>
                <div><dt>Maximum travel surcharge</dt><dd>{Math.round(estimate.inputs.travelPolicy.maximumTravelSurchargeRate * 100)}%</dd></div>
                <div><dt>Maximum combined credit</dt><dd>{Math.round(estimate.inputs.travelPolicy.maximumCombinedCreditRate * 100)}%</dd></div>
                <div><dt>Visits per month</dt><dd>{estimate.inputs.visitsPerMonth}</dd></div>
              </dl>
            ) : (
              <dl>
                <div><dt>Pricing size basis</dt><dd>{Number(estimate.inputs.normalizedSquareFeet).toLocaleString()} sq ft</dd></div>
                <div><dt>Retail-center size benchmark</dt><dd>{formatCurrency(estimate.inputs.sizeBenchmarkPerVisitCents)}</dd></div>
                <div><dt>Property modifier</dt><dd>{formatMultiplier(estimate.inputs.complexityModifier)}</dd></div>
                <div><dt>Visits per month</dt><dd>{estimate.inputs.visitsPerMonth}</dd></div>
                <div><dt>Frequency modifier</dt><dd>{formatMultiplier(estimate.inputs.frequencyMultiplier)}</dd></div>
              </dl>
            )}
            {estimate.managedService && (
              <p>
                Managed-service base: {formatCurrency(estimate.managedService.baseMonthlyFeeCents)} per organization per month
                {estimate.managedService.includedInContractTotal ? " (included once in the contract total)." : " (not included in this estimate)."}
              </p>
            )}
          </div>
        </section>
      )}
      {boutiqueOpen && <BoutiquePricingDialog onClose={() => setBoutiqueOpen(false)} />}
    </section>
  );
}
